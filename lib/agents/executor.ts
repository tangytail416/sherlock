import { prisma } from '@/lib/db';
import { createAIClient } from '@/lib/ai';
import { createSplunkClientFromDB } from '@/lib/splunk/client';
import { loadAgentConfig } from './config-loader';
import { getActiveWhitelistedIOCs, getWhitelistAsJSON, filterWhitelistedFromSplunkResults } from './whitelist-helper';
import type {
  AgentConfig,
  AgentExecutionContext,
  AgentExecutionResult,
} from './types';

/**
 * Execute Splunk queries for an agent
 */
export async function executeSplunkQueries(
  config: AgentConfig,
  context: AgentExecutionContext
): Promise<Record<string, any[]>> {
  const results: Record<string, any[]> = {};

  // Check if agent has Splunk queries configured
  if (!config.splunk_queries?.common_queries) {
    return results;
  }

  // Fetch whitelisted IOCs for filtering
  const whitelists = await getActiveWhitelistedIOCs();
  console.log(`[Executor] Loaded ${whitelists.length} active whitelisted IOCs for filtering`);

  try {
    // Try to get Splunk client from database config or env vars
    const splunkClient = await createSplunkClientFromDB();

    if (!splunkClient) {
      console.log(`Splunk not configured, skipping queries for ${config.name}`);
      return results;
    }

    // Execute each query
    for (const query of config.splunk_queries.common_queries) {
      try {
        console.log(`Executing Splunk query: ${query.name}`);

        // Extract time window from alert data if available
        let earliestTime = '-1h';
        let latestTime = 'now';

        // First, check if time_range is explicitly set (e.g., from threat hunt)
        if (context.alertData?.time_range) {
          earliestTime = context.alertData.time_range.earliest || '-1h';
          latestTime = context.alertData.time_range.latest || 'now';
          console.log('[Executor] Using time range from alert data (threat hunt)');
        }
        // Otherwise, create time window around alert timestamp
        else if (context.alertData?.timestamp) {
          try {
            const alertTime = new Date(context.alertData.timestamp);
            const oneHourBefore = new Date(alertTime.getTime() - 3600000);
            const oneHourAfter = new Date(alertTime.getTime() + 3600000);

            // Format as Splunk-compatible time (ISO 8601 or epoch)
            earliestTime = Math.floor(oneHourBefore.getTime() / 1000).toString();
            latestTime = Math.floor(oneHourAfter.getTime() / 1000).toString();
            console.log('[Executor] Using time window around alert timestamp');
          } catch (timeError) {
            console.warn('Could not parse alert timestamp, using default time range');
          }
        }

        // Ensure query starts with "search" command if it doesn't already
        let searchQuery = query.spl.trim();
        if (!searchQuery.startsWith('search ') && !searchQuery.startsWith('|')) {
          searchQuery = 'search ' + searchQuery;
        }

        console.log(`[Executor] Query name: ${query.name}`);
        console.log(`[Executor] Query SPL:\n${searchQuery}`);
        console.log(`[Executor] Time range: ${earliestTime} to ${latestTime}`);

        // Execute query (using oneshot for simplicity)
        const queryStartTime = Date.now();
        let queryStatus = 'success';
        let queryError: string | null = null;

        try {
          const queryResults = await splunkClient.oneshot(searchQuery, {
            earliestTime,
            latestTime,
            maxResults: 100,
          });

          // Filter out whitelisted IOCs from results
          const { filtered, removedCount } = filterWhitelistedFromSplunkResults(queryResults, whitelists);

          results[query.name] = filtered;
          console.log(`Query "${query.name}" returned ${queryResults.length} results (${removedCount} filtered by whitelist, ${filtered.length} remaining)`);

          const queryExecutionTime = Date.now() - queryStartTime;

          // Log query execution to audit trail
          await prisma.queryExecution.create({
            data: {
              savedQueryId: null, // Not linked to saved query since these are agent queries
              executedBy: 'agent',
              status: 'success',
              resultCount: filtered.length,
              executionTimeMs: queryExecutionTime,
              timeRange: {
                earliest: earliestTime,
                latest: latestTime,
              },
            },
          }).catch((logError) => {
            console.error('[Executor] Failed to log query execution:', logError);
          });

        } catch (queryError: any) {
          queryStatus = 'failed';
          queryError = queryError.message;

          console.error(`Error executing query "${query.name}":`, queryError.message);
          console.error(`Failed query SPL:\n${query.spl}`);
          console.error(`Full error:`, queryError);

          // Store empty array but continue with other queries
          results[query.name] = [];
          // Add error information to results for debugging
          results[query.name + '_error'] = queryError.message;

          const queryExecutionTime = Date.now() - queryStartTime;

          // Log failed query execution
          await prisma.queryExecution.create({
            data: {
              savedQueryId: null,
              executedBy: 'agent',
              status: 'failed',
              resultCount: 0,
              executionTimeMs: queryExecutionTime,
              timeRange: {
                earliest: earliestTime,
                latest: latestTime,
              },
              errorMessage: queryError.message,
            },
          }).catch((logError) => {
            console.error('[Executor] Failed to log query execution:', logError);
          });
        }
      } catch (error: any) {
        console.error(`Unexpected error in query execution block:`, error);
        results[query.name] = [];
      }
    }
  } catch (error: any) {
    console.error('Error initializing Splunk client:', error.message);
    // Return empty results but don't fail the agent execution
  }

  return results;
}

/**
 * Execute an agent with the given context
 */
export async function executeAgent(
  agentName: string,
  context: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const startTime = Date.now();

  try {
    // Load agent configuration
    const config = await loadAgentConfig(agentName);
    if (!config) {
      throw new Error(`Agent configuration not found for: ${agentName}`);
    }

    if (!config.enabled) {
      throw new Error(`Agent is disabled: ${agentName}`);
    }

    // Create agent execution record
    const execution = await prisma.agentExecution.create({
      data: {
        investigationId: context.investigationId,
        agentName: config.name,
        status: 'running',
        startedAt: new Date(),
      },
    });

    try {
      // Execute Splunk queries if configured
      const splunkResults = await executeSplunkQueries(config, context);
      context.splunkResults = splunkResults;

      // Build the prompt (now async to fetch whitelist)
      const prompt = await buildAgentPrompt(config, context);

      // Get AI provider (use investigation's provider or default)
      const aiProvider = context.aiProvider || 'glm';
      const modelName = mapProviderToModel(aiProvider, config.model.model_name);

      // Create AI client
      const client = await createAIClient(aiProvider, {
        modelName,
        temperature: config.model.temperature,
        maxTokens: config.model.max_tokens,
      });

      // Execute AI call
      const response = await client.chat([
        { role: 'system', content: config.prompts.system },
        { role: 'user', content: prompt },
      ]);

      // Parse result
      const result = parseAgentResult(response.content, config);

      // Calculate confidence
      const confidence = extractConfidence(result);

      const executionTime = Date.now() - startTime;

      // Update execution record
      await prisma.agentExecution.update({
        where: { id: execution.id },
        data: {
          status: 'completed',
          result,
          confidence: confidence ?? undefined,
          executionTime,
          modelUsed: response.model,
          completedAt: new Date(),
        },
      });

      return {
        success: true,
        result,
        confidence: confidence ?? undefined,
        executionTime,
        metadata: {
          model: response.model,
          usage: response.usage,
        },
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Update execution with error
      await prisma.agentExecution.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
          executionTime,
          completedAt: new Date(),
        },
      });

      return {
        success: false,
        error: error.message || 'Agent execution failed',
        executionTime,
      };
    }
  } catch (error: any) {
    const executionTime = Date.now() - startTime;

    return {
      success: false,
      error: error.message || 'Failed to execute agent',
      executionTime,
    };
  }
}

/**
 * Build the investigation prompt for the agent
 */
async function buildAgentPrompt(
  config: AgentConfig,
  context: AgentExecutionContext
): Promise<string> {
  // Fetch whitelisted IOCs
  const whitelistedIOCs = await getActiveWhitelistedIOCs();
  const whitelistJSON = getWhitelistAsJSON(whitelistedIOCs);
  
  const template = config.prompts.investigation_template || `
Investigate the following security alert:

Alert Data:
{alert_data}

{splunk_data}

Previous Investigation Results:
{previous_results}

Provide a detailed analysis based on your capabilities: {capabilities}
`;

  // Build Splunk data section
  let splunkSection = '';
  if (context.splunkResults && Object.keys(context.splunkResults).length > 0) {
    splunkSection = '=== SPLUNK QUERY RESULTS ===\n\n';
    for (const [queryName, results] of Object.entries(context.splunkResults)) {
      splunkSection += `Query: ${queryName}\n`;
      if (results.length === 0) {
        splunkSection += 'No results found\n\n';
      } else {
        splunkSection += `Results (${results.length} entries):\n`;
        splunkSection += JSON.stringify(results) + '\n\n';
      }
    }
  } else {
    splunkSection = '(No Splunk data available)\n';
  }

  // Extract common alert fields for template variables
  const alertData = context.alertData || {};
  const alertType = alertData.title || alertData.type || 'unknown';
  const severity = alertData.severity || 'medium';
  const timestamp = alertData.timestamp || new Date().toISOString();
  
  // Extract entities from alert
  const entities: string[] = [];
  if (alertData.rawData) {
    const raw = alertData.rawData;
    if (raw.user || raw.username) entities.push(`user: ${raw.user || raw.username}`);
    if (raw.source_ip || raw.src_ip) entities.push(`ip: ${raw.source_ip || raw.src_ip}`);
    if (raw.hostname || raw.host) entities.push(`hostname: ${raw.hostname || raw.host}`);
    if (raw.file_hash || raw.hash) entities.push(`file_hash: ${raw.file_hash || raw.hash}`);
    if (raw.process_name) entities.push(`process: ${raw.process_name}`);
  }
  const entitiesStr = entities.length > 0 ? entities.join(', ') : 'See alert data below';

  // Build context/details from alert
  const alertContext = alertData.description || JSON.stringify(alertData.rawData || {});

  // Format previous results properly - handle both objects and arrays
  let previousResultsStr = 'None';
  if (context.previousResults && Object.keys(context.previousResults).length > 0) {
    previousResultsStr = '';
    for (const [agentName, result] of Object.entries(context.previousResults)) {
      previousResultsStr += `\n=== ${agentName.toUpperCase()} RESULTS ===\n`;
      previousResultsStr += JSON.stringify(result) + '\n';
    }
  }

  // Build investigation_id for agents that need it
  const investigationId = context.investigationId || 'unknown';
  
  // Build all_events from previous results for timeline correlation
  let allEventsStr = '';
  if (context.previousResults && Object.keys(context.previousResults).length > 0) {
    const events: any[] = [];
    for (const [agentName, result] of Object.entries(context.previousResults)) {
      // Extract events/findings from each agent
      if (result && typeof result === 'object') {
        if (result.timeline_analysis) {
          events.push(...result.timeline_analysis);
        }
        if (result.timeline) {
          events.push(...result.timeline);
        }
        if (result.events) {
          events.push(...result.events);
        }
      }
    }
    allEventsStr = JSON.stringify(events);
  }

  // Build IOCs list from previous results for case correlation
  let iocsStr = '';
  let mitreStr = '';
  let entitiesFromResults = '';
  if (context.previousResults && Object.keys(context.previousResults).length > 0) {
    const iocs = new Set<string>();
    const mitreArray = new Set<string>();
    const entitySet = new Set<string>();
    
    for (const result of Object.values(context.previousResults)) {
      if (result && typeof result === 'object') {
        // Extract IOCs
        if (result.indicators_of_compromise) {
          for (const ioc of result.indicators_of_compromise) {
            if (ioc.indicator) iocs.add(ioc.indicator);
          }
        }
        if (result.security_indicators) {
          for (const indicator of result.security_indicators) {
            if (indicator.indicator) iocs.add(indicator.indicator);
          }
        }
        // Extract MITRE techniques
        if (result.threat_assessment?.attack_type) {
          if (Array.isArray(result.threat_assessment.attack_type)) {
            result.threat_assessment.attack_type.forEach((t: string) => mitreArray.add(t));
          }
        }
        if (result.mitre_attack) {
          if (Array.isArray(result.mitre_attack)) {
            result.mitre_attack.forEach((t: string) => mitreArray.add(t));
          }
        }
        // Extract entities
        if (result.trigger_event) {
          const trigger = result.trigger_event;
          if (trigger.principal) entitySet.add(trigger.principal);
          if (trigger.source_ip) entitySet.add(trigger.source_ip);
          if (trigger.user_identity) entitySet.add(trigger.user_identity);
        }
      }
    }
    
    iocsStr = Array.from(iocs).join(', ') || 'None identified';
    mitreStr = Array.from(mitreArray).join(', ') || 'None identified';
    entitiesFromResults = Array.from(entitySet).join(', ') || entitiesStr;
  }

  // Build whitelist section
  let whitelistSection = '';
  if (whitelistedIOCs.length > 0) {
    whitelistSection = `\n\n=== WHITELISTED IOCs (KNOWN SAFE - MUST EXCLUDE) ===\n\n${whitelistJSON}\n\nCRITICAL INSTRUCTION: The above IOCs are verified safe entities that MUST be completely excluded from your security analysis:\n- DO NOT investigate these users, IPs, domains, files, or hashes\n- DO NOT include them in your findings, analysis, or reports\n- DO NOT flag them as suspicious or mention them as threats\n- These entities have been pre-approved and filtered for your safety\n- If you see activity from these IOCs, treat it as normal/benign baseline activity\n\nThese IOCs have already been filtered from your Splunk results, but if you encounter them in correlation analysis or pattern matching, you MUST skip them.\n`;
  }

  // Build Splunk reference section (static + dynamic structure)
  let splunkReference = `\n\n=== SPLUNK INDEXES & SOURCETYPES AVAILABLE ===\n\nIndexes:\n- cloudtrail: AWS API activity, security auditing\n- vpcflow: Network traffic analysis, flow logs\n- linux: Linux security, Sysmon, auth logs\n- windows: Windows events, security logs\n- cloudwatch: ECS logs, Lambda, Bedrock AI\n- aws-metadata: EC2 metadata, resource inventory\n- loadbalancer: ELB access logs, web traffic\n- waf: AWS WAF logs\n- amazonq: Amazon Q invocation logs\n\nKey Source Types:\n- aws:cloudtrail (cloudtrail index): IAM activity, API calls\n- aws:cloudwatchlogs:vpcflow (vpcflow index): Network traffic\n- aws:cloudwatchlogs:ecs (cloudwatch index): Container logs\n- sysmon:linux (linux index): Process creation, network connections\n- linux_auth (linux index): SSH logins, sudo commands\n- XmlWinEventLog (windows index): Windows security events\n\nExample Queries (ALWAYS include earliest= and latest=):\n- index=cloudtrail eventName=ConsoleLogin earliest=-24h latest=now | table _time, userIdentity.userName, sourceIPAddress\n- index=vpcflow action=REJECT earliest=-7d latest=now | stats count by srcaddr, dstport\n- index=linux sourcetype=sysmon:linux EventID=1 earliest=-1h latest=now | table _time, Image, CommandLine\n- index=windows EventCode=4625 earliest=-24h latest=now | stats count by Account_Name\n\nCRITICAL SPLUNK TIME FORMAT RULES:\n1. ALWAYS use earliest= and latest= in ALL queries\n2. Relative time (PREFERRED): earliest=-24h, earliest=-7d, earliest=-30m, latest=now\n3. Snap to time: earliest=-24h@h (snap to hour), earliest=-d@d (snap to day start)\n4. Absolute time format: earliest="11/01/2025:00:00:00" latest="11/30/2025:23:59:59"\n   - Format MUST be: MM/DD/YYYY:HH:MM:SS (American format with colons)\n5. Epoch time: earliest=1698796800 latest=1701388799\n6. NEVER use ISO 8601 format (2025-11-01T00:00:00) - THIS IS INVALID\n\nExamples:\n- Last 24 hours: earliest=-24h latest=now\n- Last 7 days: earliest=-7d latest=now\n- Yesterday: earliest=-d@d latest=@d\n- Specific dates: earliest="11/01/2025:00:00:00" latest="11/30/2025:23:59:59"\n- This month: earliest=-mon@mon latest=now\n`;

  // Fetch dynamic index structure from database
  try {
    const splunkConfig = await prisma.splunkConfig.findFirst({
      where: { isActive: true },
      select: { indexStructure: true, structureFetchedAt: true },
    });

    if (splunkConfig?.indexStructure && splunkConfig.structureFetchedAt) {
      const structure = splunkConfig.indexStructure as Record<string, Record<string, { fields: string[] }>>;

      splunkReference += `\n\n=== DISCOVERED INDEX STRUCTURE (Fetched: ${new Date(splunkConfig.structureFetchedAt).toLocaleString()}) ===\n\n`;
      splunkReference += `This section contains actual indexes, sourcetypes, and EXTRACTED FIELDS from your Splunk instance.\n`;
      splunkReference += `IMPORTANT: These fields are PRE-EXTRACTED by Splunk and available for immediate use in queries.\n`;
      splunkReference += `DO NOT use rex or regex commands to extract these fields - they are already available!\n\n`;

      for (const [index, sourcetypes] of Object.entries(structure)) {
        splunkReference += `\nIndex: ${index}\n`;
        splunkReference += `${'='.repeat(50)}\n`;

        for (const [sourcetype, data] of Object.entries(sourcetypes)) {
          splunkReference += `\n  Sourcetype: ${sourcetype}\n`;
          splunkReference += `  ${'-'.repeat(48)}\n`;

          if (data.fields && data.fields.length > 0) {
            splunkReference += `  Extracted Fields (${data.fields.length}):\n`;
            splunkReference += `  ${data.fields.join(', ')}\n`;
          } else {
            splunkReference += `  Extracted Fields: None found\n`;
          }
        }
      }

      splunkReference += `\n${'='.repeat(50)}\n`;
      splunkReference += `CRITICAL: The fields listed above are ALREADY EXTRACTED. Use them directly in your queries.\n`;
      splunkReference += `Example: index=vpcflow srcaddr="10.0.0.1" (NOT: index=vpcflow | rex "..." )\n`;
    }
  } catch (error) {
    console.error('Error fetching index structure:', error);
    // Continue without dynamic structure
  }

  // Replace all template variables
  return template
    .replace(/\{alert_data\}/g, JSON.stringify(alertData))
    .replace(/\{splunk_data\}/g, splunkSection)
    .replace(/\{previous_results\}/g, previousResultsStr)
    .replace(/\{capabilities\}/g, config.capabilities.join(', '))
    .replace(/\{alert_type\}/g, alertType)
    .replace(/\{severity\}/g, severity)
    .replace(/\{timestamp\}/g, timestamp)
    .replace(/\{entities\}/g, entitiesFromResults || entitiesStr)
    .replace(/\{context\}/g, alertContext)
    .replace(/\{investigation_id\}/g, investigationId)
    .replace(/\{all_events\}/g, allEventsStr || '[]')
    .replace(/\{iocs\}/g, iocsStr)
    .replace(/\{mitre_techniques\}/g, mitreStr)
    .replace(/\{time_range\}/g, `${timestamp} (±24 hours)`)
    .replace(/\{whitelist\}/g, whitelistSection)
    + splunkReference;
}

/**
 * Append whitelist to any prompt that doesn't have the {whitelist} placeholder
 */
function appendWhitelistToPrompt(prompt: string, whitelistJSON: string): string {
  if (whitelistJSON && JSON.parse(whitelistJSON) && Object.keys(JSON.parse(whitelistJSON)).length > 0) {
    if (!prompt.includes('WHITELISTED IOCs')) {
      return prompt + `\n\n=== WHITELISTED IOCs (KNOWN SAFE - MUST EXCLUDE) ===\n\n${whitelistJSON}\n\nCRITICAL INSTRUCTION: The above IOCs are verified safe entities that MUST be completely excluded from your security analysis:\n- DO NOT investigate these users, IPs, domains, files, or hashes\n- DO NOT include them in your findings, analysis, or reports\n- DO NOT flag them as suspicious or mention them as threats\n- These entities have been pre-approved and filtered for your safety\n- If you see activity from these IOCs, treat it as normal/benign baseline activity\n\nThese IOCs have already been filtered from your Splunk results, but if you encounter them in correlation analysis or pattern matching, you MUST skip them.`;
    }
  }
  return prompt;
}

/**
 * Parse agent result based on output schema
 */
function parseAgentResult(content: string, config: AgentConfig): any {
  if (config.output_schema?.type === 'json') {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try parsing the whole content as JSON
      return JSON.parse(content);
    } catch {
      // If parsing fails, return as text
      return { analysis: content, raw: content };
    }
  }

  // For markdown or mixed, return as structured object
  return {
    analysis: content,
    raw: content,
  };
}

/**
 * Extract confidence score from result
 */
function extractConfidence(result: any): number | null {
  if (typeof result === 'object' && result !== null) {
    if ('confidence' in result && typeof result.confidence === 'number') {
      return Math.min(Math.max(result.confidence, 0), 1);
    }
    if ('confidence_score' in result && typeof result.confidence_score === 'number') {
      return Math.min(Math.max(result.confidence_score, 0), 1);
    }
  }
  return null;
}

/**
 * Map AI provider to model name
 */
function mapProviderToModel(provider: string, configModel: string): string {
  // Map the config model to provider-specific models
  const modelMap: Record<string, Record<string, string>> = {
    glm: {
      'claude-sonnet-4-20250514': 'glm-4-plus',
      'claude-3-5-sonnet-20241022': 'glm-4-plus',
      default: 'glm-4-plus',
    },
    openai: {
      'claude-sonnet-4-20250514': 'gpt-4-turbo',
      'claude-3-5-sonnet-20241022': 'gpt-4-turbo',
      default: 'gpt-4-turbo',
    },
    azure: {
      'claude-sonnet-4-20250514': 'gpt-4',
      'claude-3-5-sonnet-20241022': 'gpt-4',
      default: 'gpt-4',
    },
    openrouter: {
      'claude-sonnet-4-20250514': 'anthropic/claude-3.5-sonnet',
      'claude-3-5-sonnet-20241022': 'anthropic/claude-3.5-sonnet',
      default: 'anthropic/claude-3.5-sonnet',
    },
  };

  const providerModels = modelMap[provider] || modelMap.glm;
  return providerModels[configModel] || providerModels.default;
}

/**
 * Execute multiple agents in sequence
 */
export async function executeAgentChain(
  agentNames: string[],
  context: AgentExecutionContext
): Promise<Map<string, AgentExecutionResult>> {
  const results = new Map<string, AgentExecutionResult>();
  let previousResults: Record<string, any> = context.previousResults || {};

  for (const agentName of agentNames) {
    const result = await executeAgent(agentName, {
      ...context,
      previousResults,
    });

    results.set(agentName, result);

    if (result.success && result.result) {
      previousResults[agentName] = result.result;
    }

    // Stop chain if an agent fails
    if (!result.success) {
      break;
    }
  }

  return results;
}
