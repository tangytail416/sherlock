export interface AgentConfig {
  name: string;
  version: string;
  type: 'orchestrator' | 'specialist' | 'utility' | 'correlation';
  enabled: boolean;
  domain?: string;
  description: string;
  model: {
    provider: string;
    model_name: string;
    temperature: number;
    max_tokens: number;
  };
  capabilities: string[];
  triggers?: Array<{
    alert_type: string;
    severity: string[];
    conditions?: Record<string, any>;
  }>;
  dependencies?: string[];
  tools: Array<{
    name: string;
    type: 'splunk_query' | 'api_call' | 'database_query' | 'script_execution' | 'internal';
    config: Record<string, any>;
    rate_limit?: {
      max_requests: number;
      window: string;
    };
  }>;
  prompts: {
    system: string;
    investigation_template?: string;
    analysis_template?: string;
    aggregation_template?: string;
  };
  queries?: Record<string, string>;
  output_schema?: {
    type: 'json' | 'markdown' | 'mixed';
    fields?: Record<string, any>;
  };
  escalation_rules?: Array<{
    condition: string;
    severity: string;
    notify?: string[];
  }>;
  confidence_thresholds?: {
    high: number;
    medium: number;
    low: number;
  };
  timeout?: number;
  retry_policy?: {
    max_attempts: number;
    backoff_multiplier: number;
  };
  memory?: {
    type: 'short_term' | 'long_term' | 'episodic';
    retention_period: string;
  };
  splunk_queries?: {
    index: string;
    sourcetype: string;
    common_queries?: Array<{
      name: string;
      spl: string;
    }>;
    whitelisted_accounts?: string[];
  };
  metadata?: {
    author?: string;
    tags?: string[];
    last_updated?: string;
  };
}

export interface AgentExecutionContext {
  investigationId: string;
  alertData: any;
  previousResults?: Record<string, any>;
  aiProvider: string;
  splunkResults?: Record<string, any[]>;
}

export interface AgentExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  confidence?: number;
  executionTime: number;
  metadata?: Record<string, any>;
}

// =============================================================================
// THREAT HUNTING TYPES
// =============================================================================

/**
 * Configuration for a threat hunting session
 */
export interface ThreatHuntConfig {
  // Detection patterns (DEPRECATED - no longer used, agent generates own plans)
  patterns?: string[];

  // Maximum number of hunt cycles to run (each cycle generates new hunt objectives)
  maxCycles?: number;

  // Time interval between cycles (in seconds)
  cycleIntervalSeconds?: number;

  // Maximum findings to process per pattern
  maxFindingsPerPattern?: number;

  // Minimum severity to spawn investigations
  minSeverityForInvestigation?: 'critical' | 'high' | 'medium' | 'low';

  // Time window for deduplication (in hours)
  deduplicationWindowHours?: number;

  // Whether to automatically create investigations
  autoCreateInvestigations?: boolean;

  // Whether to automatically start created investigations (only applies if autoCreateInvestigations is true)
  autoStartInvestigations?: boolean;

  // AI provider to use for threat hunter agent
  aiProvider?: string;

  // Model to use for threat hunter agent
  modelUsed?: string;

  // Time range for Splunk queries (optional, defaults to all time)
  timeRange?: {
    // Start time (ISO string or Splunk relative time like "-30d", "-7d@d")
    earliest?: string;
    // End time (ISO string or Splunk relative time like "now", "@d")
    latest?: string;
  };

  // Focus areas for threat hunting (optional, hunts all areas if not specified)
  focusAreas?: string[];  // e.g., ["rootkit", "brute_force", "aws_iam_abuse", "data_exfiltration"]
}

/**
 * State of a threat hunting workflow
 */
export interface ThreatHuntState {
  // Threat hunt ID
  threatHuntId: string;

  // Current status
  status: 'active' | 'paused' | 'completed' | 'failed';

  // Current cycle number
  currentCycle: number;

  // Current pattern being processed
  currentPatternId?: string;

  // Configuration
  config: ThreatHuntConfig;

  // Findings discovered so far (hashes)
  discoveredFindingHashes: Set<string>;

  // Statistics
  stats: {
    totalFindings: number;
    criticalFindings: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
    investigationsSpawned: number;
    patternsProcessed: number;
    cyclesCompleted: number;
  };

  // Error information if failed
  error?: string;

  // Timestamps
  startedAt: Date;
  lastRunAt?: Date;
  completedAt?: Date;
}

/**
 * Affected entities in a threat finding
 */
export interface AffectedEntities {
  users?: string[];
  hosts?: string[];
  ips?: string[];
  processes?: string[];
}

/**
 * Structured title components for alert title generation
 */
export interface TitleDetail {
  primary_entity: string;
  key_detail: string;
}

/**
 * Threat hunter agent output for a single finding
 */
export interface ThreatFinding {
  title_detail?: TitleDetail;
  finding_type: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number; // 0.0 - 1.0
  affected_entities: AffectedEntities;
  mitre_attack: string[];
  raw_indicators: Record<string, any>;
}

/**
 * Complete threat hunter agent output
 */
export interface ThreatHunterOutput {
  findings: ThreatFinding[];
  summary: {
    total_findings: number;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
  };
  // For autonomous hunt plan generation
  hunt_plan?: Array<{
    id: string;
    name: string;
    description: string;
    what_to_look_for: string[];
    category: string;
    priority: string;
  }>;
  rationale?: string;
}

/**
 * Processed threat finding with additional metadata
 */
export interface ProcessedThreatFinding extends ThreatFinding {
  hash: string;
  isDuplicate: boolean;
  patternId: string;
  detectedAt: Date;
  alertId?: string;
  investigationId?: string;
}
