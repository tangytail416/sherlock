/**
 * Threat Hunting Detection Patterns
 *
 * Pre-defined Splunk queries for common suspicious activities.
 * Each pattern includes:
 * - id: Unique identifier for the pattern
 * - name: Human-readable name
 * - description: What the pattern detects
 * - category: Type of threat (authentication, endpoint, network, privilege)
 * - severity: Default severity level
 * - mitreAttack: MITRE ATT&CK technique ID
 * - splunkQuery: SPL query to execute
 * - entityExtraction: Rules for extracting affected entities
 * - threshold: Detection thresholds
 * - falsePositiveGuidance: Common benign scenarios to filter
 */

export interface DetectionPattern {
  id: string;
  name: string;
  description: string;
  category: 'authentication' | 'endpoint' | 'network' | 'privilege' | 'data_exfiltration' | 'malware';
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitreAttack: string[];
  splunkQuery: string;
  entityExtraction: {
    userField?: string;
    hostField?: string;
    sourceIpField?: string;
    processField?: string;
    additionalFields?: Record<string, string>;
  };
  threshold: {
    count?: number;
    timeWindow?: string; // e.g., "5m", "10m", "1h"
    groupBy?: string[];
  };
  falsePositiveGuidance: string[];
  confidence: number; // 0.0 - 1.0
}

export const DETECTION_PATTERNS: DetectionPattern[] = [
  // ============================================================================
  // AUTHENTICATION ATTACKS
  // ============================================================================
  {
    id: 'auth-brute-force-failed-logins',
    name: 'Brute Force Attack - Multiple Failed Logins',
    description: 'Detects multiple failed login attempts from a single source, indicating potential brute force or credential stuffing attack',
    category: 'authentication',
    severity: 'high',
    mitreAttack: ['T1110', 'T1110.001', 'T1110.003'],
    splunkQuery: `
      (index=* sourcetype=WinEventLog:Security EventCode=4625) OR
      (index=* sourcetype=linux_secure "Failed password") OR
      (index=* sourcetype="aws:cloudtrail" eventName=ConsoleLogin errorCode=Failed)
      | bucket _time span=5m
      | stats count as failed_attempts,
              values(user) as attempted_users,
              values(src) as source_ips,
              values(dest) as target_hosts,
              earliest(_time) as first_attempt,
              latest(_time) as last_attempt
        by src, dest
		| eval human_first_seen=strftime(first_attempt, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(last_attempt, "%Y-%m-%d %H:%M:%S UTC")
      | where failed_attempts > 10
      | eval timespan=tostring(last_attempt-first_attempt, "duration")
      | sort - failed_attempts
    `.trim(),
    entityExtraction: {
      userField: 'attempted_users',
      hostField: 'target_hosts',
      sourceIpField: 'source_ips',
    },
    threshold: {
      count: 10,
      timeWindow: '5m',
      groupBy: ['src', 'dest'],
    },
    falsePositiveGuidance: [
      'Service accounts with misconfigured credentials',
      'Automated systems with expired passwords',
      'User password reset attempts',
      'Logon Type 4 (Batch) or 5 (Service) are often benign internal failures',
    ],
    confidence: 0.85,
  },
  {
    id: 'auth-successful-after-failures',
    name: 'Successful Login After Multiple Failures',
    description: 'Detects successful authentication following numerous failed attempts, indicating a potentially compromised account',
    category: 'authentication',
    severity: 'critical',
    mitreAttack: ['T1110', 'T1110.001'],
    splunkQuery: `
      (index=* sourcetype=WinEventLog:Security (EventCode=4625 OR EventCode=4624)) OR
      (index=* sourcetype=linux_secure ("Failed password" OR "Accepted password"))
      | bucket _time span=10m
      | eval action=case(
          EventCode=4625 OR match(_raw, "Failed"), "failure",
          EventCode=4624 OR match(_raw, "Accepted"), "success",
          1=1, "unknown"
        )
      | stats count(eval(action="failure")) as failures,
              count(eval(action="success")) as successes,
              values(src) as source_ips,
              earliest(_time) as first_seen,
              latest(_time) as last_seen
        by user, dest
		| eval human_first_seen=strftime(first_seen, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(last_seen, "%Y-%m-%d %H:%M:%S UTC")
      | where failures > 5 AND successes > 0
      | eval risk_score = case(
          failures > 20, "critical",
          failures > 10, "high",
          1=1, "medium"
        )
      | sort - failures
    `.trim(),
    entityExtraction: {
      userField: 'user',
      hostField: 'dest',
      sourceIpField: 'source_ips',
    },
    threshold: {
      count: 5,
      timeWindow: '10m',
      groupBy: ['user', 'dest'],
    },
    falsePositiveGuidance: [
      'Users legitimately recovering from forgotten passwords',
      'VPN reconnection attempts after network issues',
      'Mobile devices with cached invalid credentials',
    ],
    confidence: 0.95,
  },
  {
    id: 'auth-impossible-travel',
    name: 'Impossible Travel - Geographic Anomaly',
    description: 'Detects user logins from geographically distant locations within an impossible timeframe',
    category: 'authentication',
    severity: 'high',
    mitreAttack: ['T1078', 'T1078.004'],
    splunkQuery: `
      index=* (sourcetype=WinEventLog:Security EventCode=4624) OR
      (sourcetype="aws:cloudtrail" eventName=ConsoleLogin errorCode=Success)
      | iplocation src
      | eval location=Country + "," + City
      | streamstats current=f last(location) as prev_location,
                   last(_time) as prev_time,
                   last(lat) as prev_lat,
                   last(lon) as prev_lon
        by user
		| eval human_first_seen=strftime(_time, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(_time, "%Y-%m-%d %H:%M:%S UTC")
      | where location != prev_location AND prev_location != ""
      | eval time_diff_hours = round((_time - prev_time) / 3600, 2)
      | eval distance_km = round(sqrt(pow((lat - prev_lat) * 111, 2) + pow((lon - prev_lon) * 85, 2)), 0)
      | eval speed_kmh = round(distance_km / time_diff_hours, 0)
      | where speed_kmh > 800
      | table _time, user, src, location, prev_location, time_diff_hours, distance_km, speed_kmh
      | sort - speed_kmh
    `.trim(),
    entityExtraction: {
      userField: 'user',
      sourceIpField: 'src',
      additionalFields: {
        location: 'location',
        prev_location: 'prev_location',
        speed_kmh: 'speed_kmh',
      },
    },
    threshold: {
      count: 1,
      timeWindow: '24h',
    },
    falsePositiveGuidance: [
      'VPN users switching exit nodes',
      'Cloud service providers with distributed infrastructure',
      'Shared accounts (should be investigated separately)',
      'Inaccurate IP geolocation data',
    ],
    confidence: 0.90,
  },

  // ============================================================================
  // ENDPOINT SUSPICIOUS BEHAVIOR
  // ============================================================================
  {
    id: 'endpoint-suspicious-process-creation',
    name: 'Suspicious Process Creation',
    description: 'Detects unusual process executions including LOLBins, suspicious parent-child relationships, and encoded commands',
    category: 'endpoint',
    severity: 'high',
    mitreAttack: ['T1059', 'T1059.001', 'T1059.003', 'T1218'],
    splunkQuery: `
      (index=* sourcetype="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=1) OR
      (index=* sourcetype=WinEventLog:Security EventCode=4688)
      | eval suspicious_patterns = case(
          match(CommandLine, "-enc|-encodedcommand|-e "), "Encoded PowerShell",
          match(CommandLine, "-nop|-noprofile|-w hidden|-windowstyle hidden"), "Hidden PowerShell",
          match(ParentImage, "(?i)(excel|winword|powerpnt|outlook)\\.exe") AND match(Image, "(?i)(powershell|cmd|wscript|cscript)\\.exe"), "Office spawning shell",
          match(Image, "(?i)regsvr32\\.exe") AND match(CommandLine, "/s|/i"), "Regsvr32 abuse",
          match(Image, "(?i)rundll32\\.exe") AND match(CommandLine, "javascript:|vbscript:"), "Rundll32 script abuse",
          match(Image, "(?i)mshta\\.exe") AND match(CommandLine, "http|javascript:|vbscript:"), "Mshta abuse",
          match(Image, "(?i)certutil\\.exe") AND match(CommandLine, "-decode|-urlcache"), "Certutil download/decode",
          match(Image, "(?i)bitsadmin\\.exe") AND match(CommandLine, "/transfer"), "Bitsadmin download",
          match(ParentImage, "(?i)w3wp\\.exe|tomcat|apache"), "Web shell execution",
          1=1, null()
        )
      | where suspicious_patterns != ""
      | stats count as execution_count,
              values(CommandLine) as command_lines,
              values(User) as users,
              values(ParentImage) as parent_processes,
              earliest(_time) as first_seen,
              latest(_time) as last_seen
        by ComputerName, Image, suspicious_patterns
		| eval human_first_seen=strftime(first_seen, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(last_seen, "%Y-%m-%d %H:%M:%S UTC")
      | sort - execution_count
    `.trim(),
    entityExtraction: {
      userField: 'users',
      hostField: 'ComputerName',
      processField: 'Image',
      additionalFields: {
        suspicious_pattern: 'suspicious_patterns',
        parent_process: 'parent_processes',
      },
    },
    threshold: {
      count: 1,
      timeWindow: '1h',
    },
    falsePositiveGuidance: [
      'Legitimate administrative scripts using PowerShell',
      'Software deployment tools using encoded commands',
      'Monitoring tools using certutil for certificate operations',
      'Backup software using bitsadmin',
    ],
    confidence: 0.88,
  },
  {
    id: 'endpoint-powershell-obfuscation',
    name: 'PowerShell Obfuscation Detected',
    description: 'Detects obfuscated PowerShell commands often used to evade detection',
    category: 'endpoint',
    severity: 'high',
    mitreAttack: ['T1027', 'T1059.001', 'T1027.010'],
    splunkQuery: `
      (index=* sourcetype="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=1 Image="*powershell.exe") OR
      (index=* sourcetype=WinEventLog:Security EventCode=4688 Process_Name="*powershell.exe")
      | rex field=CommandLine max_match=0 "(?<backticks>\`)"
      | rex field=CommandLine max_match=0 "(?<carets>\\^)"
      | rex field=CommandLine max_match=0 "(?<plus_concat>\\+)"
      | eval backtick_count=mvcount(backticks),
             caret_count=mvcount(carets),
             concat_count=mvcount(plus_concat),
             cmd_length=len(CommandLine)
      | eval obfuscation_score = (backtick_count * 2) + (caret_count * 2) + (concat_count * 0.5) + (cmd_length / 100)
      | eval obfuscation_indicators = case(
          match(CommandLine, "(?i)frombase64string"), "Base64 decoding",
          match(CommandLine, "(?i)invoke-expression|iex"), "Dynamic execution",
          match(CommandLine, "(?i)downloadstring|downloadfile"), "Remote download",
          match(CommandLine, "char\\[\\]|\\[char\\]"), "Character array obfuscation",
          match(CommandLine, "-join|-f "), "String concatenation",
          backtick_count > 5, "Excessive backticks",
          1=1, null()
        )
		| eval human_first_seen=strftime(_time, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(_time, "%Y-%m-%d %H:%M:%S UTC")
      | where obfuscation_score > 10 OR obfuscation_indicators != ""
      | table _time, ComputerName, User, CommandLine, obfuscation_score, obfuscation_indicators
      | sort - obfuscation_score
    `.trim(),
    entityExtraction: {
      userField: 'User',
      hostField: 'ComputerName',
      processField: 'powershell.exe',
      additionalFields: {
        obfuscation_score: 'obfuscation_score',
        indicators: 'obfuscation_indicators',
      },
    },
    threshold: {
      count: 1,
      timeWindow: '1h',
    },
    falsePositiveGuidance: [
      'Security tools using PowerShell for legitimate purposes',
      'Configuration management scripts (SCCM, Ansible)',
      'Developer testing of PowerShell scripts',
    ],
    confidence: 0.92,
  },

  // ============================================================================
  // NETWORK ANOMALIES
  // ============================================================================
  {
    id: 'network-suspicious-connections',
    name: 'Suspicious Network Connections',
    description: 'Detects unusual outbound network connections that may indicate C2 communication or data exfiltration',
    category: 'network',
    severity: 'medium',
    mitreAttack: ['T1071', 'T1071.001', 'T1071.004', 'T1041'],
    splunkQuery: `
      (index=* sourcetype="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=3) OR
      (index=* sourcetype=firewall action=allowed direction=outbound)
      | eval suspicious_indicator = case(
          match(Image, "(?i)(excel|winword|powerpnt|outlook|adobe)\\.exe") AND NOT match(DestinationIp, "^(10\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.|192\\.168\\.)"), "Office app external connection",
          match(Image, "(?i)(powershell|cmd|wscript|cscript)\\.exe") AND DestinationPort IN (443, 8443, 8080), "Shell outbound HTTPS",
          match(Image, "(?i)rundll32\\.exe") AND NOT DestinationPort IN (53, 80, 443), "Rundll32 unusual port",
          DestinationPort IN (4444, 5555, 6666, 7777, 8888, 9999), "Common C2 ports",
          match(DestinationHostname, "(?i)\\.tk$|\\.ml$|\\.ga$|\\.cf$|\\.gq$"), "Free domain TLD",
          match(DestinationHostname, "[0-9]{8,}\\.[a-z]+"), "Suspicious domain pattern",
          1=1, null()
        )
      | where suspicious_indicator != ""
      | stats count as connection_count,
              values(DestinationIp) as dest_ips,
              values(DestinationHostname) as dest_hostnames,
              values(DestinationPort) as dest_ports,
              values(User) as users,
              earliest(_time) as first_seen,
              latest(_time) as last_seen
        by ComputerName, Image, suspicious_indicator
		| eval human_first_seen=strftime(first_seen, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(last_seen, "%Y-%m-%d %H:%M:%S UTC")
      | eval connection_pattern = case(
          connection_count > 100, "High frequency (possible beaconing)",
          connection_count > 10, "Medium frequency",
          1=1, "Low frequency"
        )
      | sort - connection_count
    `.trim(),
    entityExtraction: {
      userField: 'users',
      hostField: 'ComputerName',
      processField: 'Image',
      additionalFields: {
        dest_ips: 'dest_ips',
        dest_ports: 'dest_ports',
        indicator: 'suspicious_indicator',
      },
    },
    threshold: {
      count: 5,
      timeWindow: '1h',
    },
    falsePositiveGuidance: [
      'Legitimate software update mechanisms',
      'Cloud sync applications (OneDrive, Dropbox)',
      'Browser plugins and extensions',
      'Enterprise management software',
    ],
    confidence: 0.75,
  },

  // ============================================================================
  // PRIVILEGE ESCALATION
  // ============================================================================
  {
    id: 'priv-escalation-admin-group-change',
    name: 'Administrative Group Membership Change',
    description: 'Detects additions to privileged groups which may indicate privilege escalation',
    category: 'privilege',
    severity: 'high',
    mitreAttack: ['T1098', 'T1078.002', 'T1078.003'],
    splunkQuery: `
      (index=* sourcetype=WinEventLog:Security (EventCode=4728 OR EventCode=4732 OR EventCode=4756)) OR
      (index=* sourcetype=linux_secure "usermod" "-aG")
      | eval privileged_group = case(
          match(Group_Name, "(?i)domain admins|enterprise admins|schema admins|administrators"), "Domain Admin",
          match(Group_Name, "(?i)account operators|backup operators|server operators"), "Privileged Operators",
          match(Group_Name, "(?i)remote desktop|rdp"), "RDP Access",
          match(_raw, "-aG (sudo|wheel|admin)"), "Linux Sudo/Admin",
          1=1, null()
        )
      | where privileged_group != ""
      | stats count as change_count,
              values(Member_Name) as added_members,
              values(Changed_By) as changed_by_users,
              earliest(_time) as first_change,
              latest(_time) as last_change
        by dest, Group_Name, privileged_group
		| eval human_first_seen=strftime(first_change, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(last_change, "%Y-%m-%d %H:%M:%S UTC")
      | eval time_window = tostring(last_change - first_change, "duration")
      | sort - change_count
    `.trim(),
    entityExtraction: {
      userField: 'added_members',
      hostField: 'dest',
      additionalFields: {
        group: 'Group_Name',
        changed_by: 'changed_by_users',
      },
    },
    threshold: {
      count: 1,
      timeWindow: '24h',
    },
    falsePositiveGuidance: [
      'Legitimate IT administrator actions',
      'Automated provisioning systems',
      'New employee onboarding',
      'Emergency access grants (should still be reviewed)',
    ],
    confidence: 0.90,
  },
  {
    id: 'priv-runas-different-user',
    name: 'RunAs with Different User Credentials',
    description: 'Detects use of alternate credentials (RunAs) which may indicate lateral movement or privilege escalation',
    category: 'privilege',
    severity: 'medium',
    mitreAttack: ['T1134', 'T1078'],
    splunkQuery: `
      index=* sourcetype=WinEventLog:Security EventCode=4648
      | where Account_Name != Account_Whose_Credentials_Were_Used
      | stats count as runas_count,
              values(Target_Server_Name) as target_servers,
              values(Process_Name) as processes,
              earliest(_time) as first_seen,
              latest(_time) as last_seen
        by ComputerName, Account_Name, Account_Whose_Credentials_Were_Used
		| eval human_first_seen=strftime(first_seen, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(last_seen, "%Y-%m-%d %H:%M:%S UTC")
      | eval suspicious = case(
          runas_count > 10, "High frequency",
          match(processes, "(?i)powershell|cmd|wmi"), "Shell execution",
          1=1, "Standard"
        )
      | where runas_count > 3 OR match(processes, "(?i)powershell|cmd|wmi")
      | sort - runas_count
    `.trim(),
    entityExtraction: {
      userField: 'Account_Name',
      hostField: 'ComputerName',
      additionalFields: {
        target_user: 'Account_Whose_Credentials_Were_Used',
        target_servers: 'target_servers',
      },
    },
    threshold: {
      count: 3,
      timeWindow: '1h',
    },
    falsePositiveGuidance: [
      'IT administrators using privileged accounts',
      'Scheduled tasks running under service accounts',
      'Application servers using domain credentials',
    ],
    confidence: 0.78,
  },

  // ============================================================================
  // DATA EXFILTRATION
  // ============================================================================
  {
    id: 'exfil-large-file-transfer',
    name: 'Large Outbound Data Transfer',
    description: 'Detects unusually large data transfers that may indicate data exfiltration',
    category: 'data_exfiltration',
    severity: 'medium',
    mitreAttack: ['T1020', 'T1041', 'T1048'],
    splunkQuery: `
      (index=* sourcetype=firewall action=allowed direction=outbound) OR
      (index=* sourcetype="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=3)
      | stats sum(bytes_out) as total_bytes_out,
              count as connection_count,
              values(DestinationIp) as dest_ips,
              values(DestinationPort) as dest_ports
        by src, user, _time
		| eval human_first_seen=strftime(_time, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(_time, "%Y-%m-%d %H:%M:%S UTC")
      | bucket _time span=10m
      | where total_bytes_out > 104857600
      | eval data_volume_mb = round(total_bytes_out / 1048576, 2)
      | eval severity = case(
          total_bytes_out > 1073741824, "critical",
          total_bytes_out > 524288000, "high",
          1=1, "medium"
        )
      | sort - total_bytes_out
    `.trim(),
    entityExtraction: {
      userField: 'user',
      hostField: 'src',
      sourceIpField: 'src',
      additionalFields: {
        dest_ips: 'dest_ips',
        data_volume_mb: 'data_volume_mb',
      },
    },
    threshold: {
      count: 100,
      timeWindow: '10m',
      groupBy: ['src', 'user'],
    },
    falsePositiveGuidance: [
      'Cloud backup operations',
      'Software downloads and updates',
      'Video conferencing',
      'File sharing with cloud services',
      'Database replication',
    ],
    confidence: 0.70,
  },

  // ============================================================================
  // MALWARE / PERSISTENCE
  // ============================================================================
  {
    id: 'malware-file-creation-suspicious-location',
    name: 'File Creation in Suspicious Location',
    description: 'Detects file creation in locations commonly used by malware for persistence',
    category: 'malware',
    severity: 'high',
    mitreAttack: ['T1547', 'T1543', 'T1546'],
    splunkQuery: `
      index=* sourcetype="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventCode=11
      | eval suspicious_location = case(
          match(TargetFilename, "(?i)\\\\AppData\\\\Roaming\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs\\\\Startup"), "Startup folder",
          match(TargetFilename, "(?i)\\\\Windows\\\\System32\\\\Tasks"), "Scheduled task",
          match(TargetFilename, "(?i)\\\\Windows\\\\Temp.*\\.(exe|dll|scr|bat|ps1|vbs)$"), "Temp folder executable",
          match(TargetFilename, "(?i)\\\\Users\\\\Public"), "Public folder",
          match(TargetFilename, "(?i)\\\\ProgramData.*\\.(exe|dll|ps1|vbs)$"), "ProgramData executable",
          match(TargetFilename, "(?i)\\\\AppData\\\\Local\\\\Temp.*\\.(exe|dll)$"), "User temp executable",
          1=1, null()
        )
      | where suspicious_location != ""
      | stats count as file_count,
              values(TargetFilename) as files,
              values(User) as users,
              earliest(_time) as first_seen,
              latest(_time) as last_seen
        by ComputerName, Image, suspicious_location
		| eval human_first_seen=strftime(first_seen, "%Y-%m-%d %H:%M:%S UTC")
		| eval human_last_seen=strftime(last_seen, "%Y-%m-%d %H:%M:%S UTC")
      | sort - file_count
    `.trim(),
    entityExtraction: {
      userField: 'users',
      hostField: 'ComputerName',
      processField: 'Image',
      additionalFields: {
        location: 'suspicious_location',
        files: 'files',
      },
    },
    threshold: {
      count: 1,
      timeWindow: '1h',
    },
    falsePositiveGuidance: [
      'Software installers placing shortcuts in Startup',
      'System administrators deploying scheduled tasks',
      'Antivirus software quarantine operations',
      'Windows Update creating temporary files',
    ],
    confidence: 0.85,
  },
];

/**
 * Get pattern by ID
 */
export function getPatternById(id: string): DetectionPattern | undefined {
  return DETECTION_PATTERNS.find(p => p.id === id);
}

/**
 * Get patterns by category
 */
export function getPatternsByCategory(category: DetectionPattern['category']): DetectionPattern[] {
  return DETECTION_PATTERNS.filter(p => p.category === category);
}

/**
 * Get patterns by severity
 */
export function getPatternsBySeverity(severity: DetectionPattern['severity']): DetectionPattern[] {
  return DETECTION_PATTERNS.filter(p => p.severity === severity);
}

/**
 * Get all pattern IDs
 */
export function getAllPatternIds(): string[] {
  return DETECTION_PATTERNS.map(p => p.id);
}
