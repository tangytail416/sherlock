/**
 * Simplified Threat Hunting Detection Patterns
 * Compatible with basic Splunk deployments
 */

import type { DetectionPattern } from './patterns';

export const SIMPLE_DETECTION_PATTERNS: DetectionPattern[] = [
  // Simple brute force detection
  {
    id: 'auth-failed-logins-simple',
    name: 'Multiple Failed Login Attempts',
    description: 'Detects multiple failed login attempts',
    category: 'authentication',
    severity: 'high',
    mitreAttack: ['T1110.001'],
    splunkQuery: `
      index=* earliest=-30d latest=now (EventCode=4625 OR "Failed password")
      | stats count by src_ip, user, dest
      | where count > 5
      | sort - count
    `.trim(),
    entityExtraction: {
      userField: 'user',
      hostField: 'dest',
      sourceIpField: 'src_ip',
    },
    threshold: {
      count: 5,
      timeWindow: '30d',
    },
    falsePositiveGuidance: ['Service accounts', 'Password resets'],
    confidence: 0.75,
  },

  // Simple process execution
  {
    id: 'endpoint-powershell-execution',
    name: 'PowerShell Execution',
    description: 'Detects PowerShell process execution',
    category: 'endpoint',
    severity: 'medium',
    mitreAttack: ['T1059.001'],
    splunkQuery: `
      index=* earliest=-30d latest=now (powershell.exe OR pwsh.exe)
      | stats count by ComputerName, User, CommandLine
      | where count > 0
      | head 20
    `.trim(),
    entityExtraction: {
      userField: 'User',
      hostField: 'ComputerName',
      processField: 'powershell.exe',
    },
    threshold: {
      count: 1,
    },
    falsePositiveGuidance: ['Legitimate admin scripts', 'Monitoring tools'],
    confidence: 0.60,
  },
];
