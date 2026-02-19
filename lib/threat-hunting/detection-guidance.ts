/**
 * Threat Hunting Detection Guidance (OPTIONAL REFERENCE MATERIAL)
 *
 * ⚠️ NOTE: This file is NOT used by the autonomous threat hunting workflow.
 * It exists solely as reference material for understanding common threat patterns.
 *
 * The autonomous threat hunter:
 * - Analyzes the actual Splunk environment structure
 * - Generates its own hunt objectives dynamically
 * - Creates custom queries based on available data
 * - Is NOT limited by pre-defined patterns
 *
 * This file serves as:
 * - Examples of threat hunting methodologies
 * - MITRE ATT&CK technique references
 * - Detection logic inspiration for humans
 *
 * To customize threat hunting, modify the agent's system prompt in:
 * /app/agents/threat_hunter.yaml
 */

export interface DetectionGuidance {
  id: string;
  name: string;
  description: string;
  category: 'authentication' | 'endpoint' | 'network' | 'privilege' | 'data_exfiltration' | 'malware';
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitreAttack: string[];

  // Detection logic guidance (NOT a hardcoded query)
  detectionLogic: {
    // What to look for
    indicators: string[];
    // Event types/log sources to search
    logSources: string[];
    // Key fields to analyze
    keyFields: string[];
    // Threshold conditions
    thresholds: Record<string, any>;
    // Time window to search
    timeWindow: string;
  };

  // Query construction hints for the agent
  queryHints: {
    // General approach
    approach: string;
    // Aggregation strategy
    aggregation?: string;
    // Filtering suggestions
    filtering?: string;
    // Examples (without hardcoded indexes)
    exampleLogic?: string;
  };

  // Entity extraction guidance
  entityExtraction: {
    userField?: string[];
    hostField?: string[];
    sourceIpField?: string[];
    processField?: string[];
  };

  // False positive guidance
  falsePositiveGuidance: string[];

  // Confidence level
  confidence: number;
}

export const DETECTION_GUIDANCE: DetectionGuidance[] = [
  // ============================================================================
  // AUTHENTICATION ATTACKS
  // ============================================================================
  {
    id: 'auth-brute-force',
    name: 'Brute Force Attack Detection',
    description: 'Detect multiple failed login attempts from a single source indicating credential guessing attacks',
    category: 'authentication',
    severity: 'high',
    mitreAttack: ['T1110', 'T1110.001', 'T1110.003'],

    detectionLogic: {
      indicators: [
        'Multiple failed login attempts (>10) from same source IP',
        'Failed attempts across multiple user accounts',
        'Short time window between attempts (minutes)',
      ],
      logSources: [
        'Windows Security Event Logs (EventCode 4625 for failures)',
        'Linux auth logs (Failed password)',
        'AWS CloudTrail (ConsoleLogin with errorCode)',
        'Application authentication logs',
      ],
      keyFields: [
        'Source IP address',
        'Username/Account name',
        'Destination host',
        'Event code or status',
        'Timestamp',
      ],
      thresholds: {
        min_failed_attempts: 10,
        time_window_minutes: 5,
      },
      timeWindow: '-30d',
    },

    queryHints: {
      approach: 'Find authentication failure events, group by source IP and destination, count failures within time buckets',
      aggregation: 'Use stats to count failures by src_ip and dest, then filter where count > threshold',
      filtering: 'Exclude service accounts (ending in $), filter to specific failure event codes',
      exampleLogic: `
        1. Search for failure events: EventCode=4625 OR "Failed password" OR errorCode=Failed
        2. Bucket time into 5-minute spans
        3. Aggregate: stats count by src_ip, dest, user
        4. Filter: where count > 10
        5. Sort by count descending
      `,
    },

    entityExtraction: {
      userField: ['user', 'Account_Name', 'username', 'User_Name'],
      hostField: ['dest', 'host', 'ComputerName', 'Workstation_Name'],
      sourceIpField: ['src', 'src_ip', 'IpAddress', 'sourceIPAddress'],
    },

    falsePositiveGuidance: [
      'Service accounts with misconfigured credentials',
      'Automated systems with expired passwords',
      'User password reset attempts (2-3 failures is normal)',
      'Logon Type 4 (Batch) or 5 (Service) are often benign',
    ],

    confidence: 0.85,
  },

  {
    id: 'auth-successful-after-failures',
    name: 'Successful Login After Multiple Failures',
    description: 'Detect successful authentication following multiple failed attempts - likely compromised account',
    category: 'authentication',
    severity: 'critical',
    mitreAttack: ['T1110', 'T1110.001'],

    detectionLogic: {
      indicators: [
        'Multiple failed login attempts (>5)',
        'Followed by successful authentication',
        'Same user account',
        'Within short time window (10-15 minutes)',
      ],
      logSources: [
        'Windows Security Event Logs (4625 failures, 4624 success)',
        'Linux auth logs (Failed password, Accepted password)',
        'Application authentication logs',
      ],
      keyFields: [
        'Username',
        'Source IP',
        'Destination host',
        'Event code/status (success vs failure)',
        'Timestamp',
      ],
      thresholds: {
        min_failures_before_success: 5,
        time_window_minutes: 10,
      },
      timeWindow: '-30d',
    },

    queryHints: {
      approach: 'Find both success and failure events, bucket by time, count each type per user',
      aggregation: 'Use eval to categorize events as success/failure, then stats count by category, user, dest',
      filtering: 'Filter to where failures > 5 AND successes > 0',
      exampleLogic: `
        1. Search for auth events: EventCode=4625 OR EventCode=4624 OR "Failed password" OR "Accepted password"
        2. Bucket time into 10-minute spans
        3. Evaluate: classify as "failure" or "success" based on event code
        4. Aggregate: count failures and successes by user, dest
        5. Filter: where failures > 5 AND successes > 0
        6. Sort by failures descending
      `,
    },

    entityExtraction: {
      userField: ['user', 'Account_Name', 'username'],
      hostField: ['dest', 'host', 'ComputerName'],
      sourceIpField: ['src', 'src_ip', 'IpAddress'],
    },

    falsePositiveGuidance: [
      'Users legitimately recovering from forgotten passwords',
      'VPN reconnection attempts after network issues',
      'Mobile devices with cached invalid credentials',
    ],

    confidence: 0.95,
  },

  // ============================================================================
  // ENDPOINT SUSPICIOUS BEHAVIOR
  // ============================================================================
  {
    id: 'endpoint-suspicious-process',
    name: 'Suspicious Process Execution',
    description: 'Detect unusual process executions including Office apps spawning shells and LOLBin usage',
    category: 'endpoint',
    severity: 'high',
    mitreAttack: ['T1059', 'T1059.001', 'T1059.003', 'T1218'],

    detectionLogic: {
      indicators: [
        'Office applications (Excel, Word, Outlook) spawning cmd.exe or powershell.exe',
        'PowerShell with suspicious flags: -enc, -nop, -w hidden',
        'Living Off the Land Binaries (LOLBins): certutil, bitsadmin, regsvr32, rundll32, mshta',
        'Unusual parent-child process relationships',
      ],
      logSources: [
        'Sysmon Event ID 1 (Process Creation)',
        'Windows Security Event ID 4688 (Process Creation)',
        'Endpoint Detection and Response (EDR) logs',
      ],
      keyFields: [
        'Process name/Image',
        'Parent process name/ParentImage',
        'Command line arguments',
        'Computer/Host name',
        'User',
      ],
      thresholds: {
        min_occurrences: 1,
      },
      timeWindow: '-30d',
    },

    queryHints: {
      approach: 'Search process creation events, look for suspicious patterns in process names and command lines',
      aggregation: 'Group by computer, process, parent process to find patterns',
      filtering: 'Use regex or wildcards to match suspicious patterns, check parent-child relationships',
      exampleLogic: `
        1. Search for process creation: EventCode=1 OR EventCode=4688
        2. Filter for suspicious patterns:
           - ParentImage contains "excel.exe", "winword.exe", "outlook.exe"
           - Image contains "powershell.exe", "cmd.exe"
           OR
           - CommandLine contains "-enc", "-encodedcommand", "-nop", "-w hidden"
           OR
           - Image contains "certutil.exe", "bitsadmin.exe", "regsvr32.exe", "rundll32.exe", "mshta.exe"
        3. Aggregate: stats count by ComputerName, Image, ParentImage, User
        4. Sort by relevance
      `,
    },

    entityExtraction: {
      userField: ['User', 'Account_Name', 'user'],
      hostField: ['ComputerName', 'Computer', 'host', 'dest'],
      processField: ['Image', 'Process_Name', 'process', 'ParentImage'],
    },

    falsePositiveGuidance: [
      'Legitimate administrative scripts using PowerShell',
      'Software deployment tools (SCCM, Ansible)',
      'Monitoring tools using certutil for certificate operations',
      'Backup software using bitsadmin',
    ],

    confidence: 0.88,
  },

  {
    id: 'endpoint-powershell-obfuscation',
    name: 'PowerShell Obfuscation Detection',
    description: 'Detect obfuscated PowerShell commands often used to evade detection',
    category: 'endpoint',
    severity: 'high',
    mitreAttack: ['T1027', 'T1059.001'],

    detectionLogic: {
      indicators: [
        'Base64 encoded commands (FromBase64String)',
        'Encoded command flags: -enc, -encodedcommand',
        'Excessive string concatenation or character arrays',
        'Download cradles: DownloadString, DownloadFile, Invoke-WebRequest',
        'Dynamic execution: Invoke-Expression (IEX)',
      ],
      logSources: [
        'Sysmon Event ID 1 (Process Creation with PowerShell)',
        'PowerShell operational logs',
        'Command line logging',
      ],
      keyFields: [
        'CommandLine',
        'Process name',
        'Computer name',
        'User',
      ],
      thresholds: {
        min_obfuscation_indicators: 1,
      },
      timeWindow: '-30d',
    },

    queryHints: {
      approach: 'Search PowerShell executions, analyze command lines for obfuscation patterns',
      aggregation: 'Group by computer and user to find patterns',
      filtering: 'Use regex or contains to match obfuscation keywords',
      exampleLogic: `
        1. Search for PowerShell: Image="*powershell.exe" OR Process_Name="*powershell.exe"
        2. Filter CommandLine for:
           - Contains "-enc" OR "-encodedcommand"
           - Contains "FromBase64String"
           - Contains "IEX" OR "Invoke-Expression"
           - Contains "DownloadString" OR "DownloadFile"
           - Contains "[char]" (character array obfuscation)
        3. Aggregate: stats count by ComputerName, User, CommandLine
        4. Review command lines for severity
      `,
    },

    entityExtraction: {
      userField: ['User', 'user'],
      hostField: ['ComputerName', 'Computer', 'host'],
      processField: ['Image', 'Process_Name', 'powershell.exe'],
    },

    falsePositiveGuidance: [
      'Security tools using PowerShell for legitimate purposes',
      'Configuration management scripts',
      'Developer testing',
    ],

    confidence: 0.92,
  },

  // ============================================================================
  // PRIVILEGE ESCALATION
  // ============================================================================
  {
    id: 'priv-admin-group-changes',
    name: 'Administrative Group Membership Changes',
    description: 'Detect additions to privileged groups indicating potential privilege escalation',
    category: 'privilege',
    severity: 'high',
    mitreAttack: ['T1098', 'T1078.002'],

    detectionLogic: {
      indicators: [
        'User added to Domain Admins, Enterprise Admins, or Administrators group',
        'Additions to privileged operator groups',
        'Changes to RDP or remote access groups',
      ],
      logSources: [
        'Windows Security Event Logs (4728, 4732, 4756 for group changes)',
        'Linux auth logs (usermod -aG)',
        'Active Directory logs',
      ],
      keyFields: [
        'Group name',
        'Member added',
        'Changed by (who made the change)',
        'Computer/Domain',
        'Timestamp',
      ],
      thresholds: {
        min_occurrences: 1,
      },
      timeWindow: '-30d',
    },

    queryHints: {
      approach: 'Search for group membership change events, filter to privileged groups',
      aggregation: 'Group by group name and member to track changes',
      filtering: 'Filter group names to privileged groups only',
      exampleLogic: `
        1. Search for group change events: EventCode=4728 OR EventCode=4732 OR EventCode=4756
        2. Filter Group_Name for:
           - Contains "Domain Admins", "Enterprise Admins", "Administrators"
           - Contains "Backup Operators", "Account Operators", "Server Operators"
           - Contains "Remote Desktop", "RDP"
        3. Aggregate: stats count by Group_Name, Member_Name, Changed_By
        4. Sort by timestamp
      `,
    },

    entityExtraction: {
      userField: ['Member_Name', 'member', 'user'],
      hostField: ['Computer', 'dest', 'host'],
    },

    falsePositiveGuidance: [
      'Legitimate IT administrator actions',
      'Automated provisioning systems',
      'New employee onboarding',
      'Emergency access grants (should still be reviewed)',
    ],

    confidence: 0.90,
  },
];

/**
 * Get guidance by ID
 */
export function getGuidanceById(id: string): DetectionGuidance | undefined {
  return DETECTION_GUIDANCE.find(g => g.id === id);
}

/**
 * Get guidance by category
 */
export function getGuidanceByCategory(category: DetectionGuidance['category']): DetectionGuidance[] {
  return DETECTION_GUIDANCE.filter(g => g.category === category);
}

/**
 * Get all guidance IDs
 */
export function getAllGuidanceIds(): string[] {
  return DETECTION_GUIDANCE.map(g => g.id);
}
