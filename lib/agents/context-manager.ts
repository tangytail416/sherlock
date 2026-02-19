/**
 * Context Manager for Agent Investigations
 * Handles token counting and context summarization to prevent exceeding LLM token limits
 */

import { createAIClient } from '@/lib/ai';
import type { ConversationMessage } from './agentic-workflow';

export interface ContextSummary {
  originalTokenCount: number;
  summarizedTokenCount: number;
  keyFindings: string;
  criticalLogs: any[];
  discardedLogsCount: number;
  timestamp: Date;
}

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
 * For more accuracy, use tiktoken library, but this is sufficient for our needs
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total token count for agent context
 */
export function calculateContextTokens(
  alertData: any,
  findings: Record<string, any>,
  agentFindings: any[],
  conversationHistory: ConversationMessage[]
): number {
  const alertTokens = estimateTokenCount(JSON.stringify(alertData));
  const findingsTokens = estimateTokenCount(JSON.stringify(findings));
  const agentFindingsTokens = estimateTokenCount(JSON.stringify(agentFindings));
  const conversationTokens = estimateTokenCount(
    conversationHistory.map(m => m.content).join('\n')
  );

  const total = alertTokens + findingsTokens + agentFindingsTokens + conversationTokens;

  console.log(`[Context Manager] Token estimation:`);
  console.log(`  - Alert data: ${alertTokens.toLocaleString()}`);
  console.log(`  - Findings: ${findingsTokens.toLocaleString()}`);
  console.log(`  - Agent findings: ${agentFindingsTokens.toLocaleString()}`);
  console.log(`  - Conversation: ${conversationTokens.toLocaleString()}`);
  console.log(`  - Total: ${total.toLocaleString()}`);

  return total;
}

/**
 * Summarize agent findings to reduce context size
 * Keeps critical logs that led to findings, discards others
 */
export async function summarizeAgentContext(
  agentName: string,
  agentFindings: any[],
  aiProvider: string
): Promise<{ summarizedFindings: any[]; summary: ContextSummary }> {
  console.log(`[Context Manager] Summarizing context for agent: ${agentName}`);

  const originalTokens = estimateTokenCount(JSON.stringify(agentFindings));
  console.log(`[Context Manager] Original findings size: ${originalTokens.toLocaleString()} tokens`);

  // Separate query results from analysis
  const queryFindings = agentFindings.filter(f => f.action === 'query' && f.results);
  const analysisFindings = agentFindings.filter(f => f.action === 'report' || f.action === 'continue');
  const otherFindings = agentFindings.filter(f => f.action !== 'query' && f.action !== 'report' && f.action !== 'continue');

  // Prepare summarization prompt
  const client = await createAIClient(aiProvider);

  const summarizationPrompt = `
You are a context summarization assistant. Your task is to condense investigation findings while preserving critical information.

AGENT: ${agentName}

QUERY RESULTS:
${JSON.stringify(queryFindings, null, 2)}

ANALYSIS:
${JSON.stringify(analysisFindings, null, 2)}

YOUR TASK:
Create a condensed summary that:
1. Extracts KEY FINDINGS with confidence levels
2. Identifies CRITICAL LOGS that directly support findings (include log IDs, timestamps, or unique identifiers)
3. Lists INDICATORS OF COMPROMISE discovered
4. Summarizes ATTACK PATTERNS or ANOMALIES
5. Notes any ERRORS or FAILED queries

OUTPUT FORMAT (JSON):
{
  "key_findings": "Brief summary of what was discovered",
  "critical_log_identifiers": ["Identifiers of logs that support findings"],
  "iocs": ["IP addresses, hashes, domains, etc."],
  "attack_patterns": ["Observed attack techniques"],
  "query_summary": "Summary of queries executed and their results",
  "confidence": 0.0-1.0,
  "errors": ["Any errors encountered"]
}

Be concise but preserve all security-relevant information.
`;

  const response = await client.chat([
    {
      role: 'system',
      content: 'You are a security analyst assistant specializing in data summarization.'
    },
    {
      role: 'user',
      content: summarizationPrompt
    },
  ], {
    maxTokens: 2000, // Limit response size
    temperature: 0.3, // Lower temperature for more focused summarization
  });

  const summary = parseJSON(response.content);

  // Extract critical logs based on summary
  const criticalLogs: any[] = [];
  const criticalIdentifiers = new Set(summary.critical_log_identifiers || []);

  for (const finding of queryFindings) {
    if (finding.results && Array.isArray(finding.results)) {
      // Keep logs that match critical identifiers or are flagged as important
      const relevantLogs = finding.results.filter((log: any) => {
        // Check if log matches any critical identifier
        const logStr = JSON.stringify(log);
        for (const identifier of criticalIdentifiers) {
          if (logStr.includes(String(identifier))) {
            return true;
          }
        }
        return false;
      });

      if (relevantLogs.length > 0) {
        criticalLogs.push({
          query: finding.query,
          iteration: finding.iteration,
          logs: relevantLogs,
          total_count: finding.results.length,
        });
      }
    }
  }

  // Create summarized findings - keep structure but with condensed data
  const summarizedFindings = [
    // Keep the summary as the main finding
    {
      action: 'summary',
      timestamp: new Date(),
      ...summary,
      original_iterations: agentFindings.length,
    },
    // Keep critical logs with their queries
    ...criticalLogs.map(log => ({
      action: 'query',
      iteration: log.iteration,
      query: log.query,
      results: log.logs,
      result_count: log.logs.length,
      total_discarded: log.total_count - log.logs.length,
    })),
    // Keep the final analysis
    ...analysisFindings.slice(-1), // Only keep the last analysis
  ];

  const summarizedTokens = estimateTokenCount(JSON.stringify(summarizedFindings));
  const totalLogsDiscarded = queryFindings.reduce((sum, f) => sum + (f.results?.length || 0), 0) - criticalLogs.reduce((sum, l) => sum + l.logs.length, 0);

  console.log(`[Context Manager] Summarization complete:`);
  console.log(`  - Original: ${originalTokens.toLocaleString()} tokens`);
  console.log(`  - Summarized: ${summarizedTokens.toLocaleString()} tokens`);
  console.log(`  - Reduction: ${((1 - summarizedTokens / originalTokens) * 100).toFixed(1)}%`);
  console.log(`  - Critical logs kept: ${criticalLogs.reduce((sum, l) => sum + l.logs.length, 0)}`);
  console.log(`  - Logs discarded: ${totalLogsDiscarded}`);

  return {
    summarizedFindings,
    summary: {
      originalTokenCount: originalTokens,
      summarizedTokenCount: summarizedTokens,
      keyFindings: summary.key_findings || '',
      criticalLogs,
      discardedLogsCount: totalLogsDiscarded,
      timestamp: new Date(),
    },
  };
}

/**
 * Summarize overall investigation context (across all agents)
 */
export async function summarizeInvestigationContext(
  findings: Record<string, any>,
  conversationHistory: ConversationMessage[],
  aiProvider: string
): Promise<{ summarizedFindings: Record<string, any>; summary: ContextSummary }> {
  console.log(`[Context Manager] Summarizing investigation context`);

  const originalTokens = estimateTokenCount(JSON.stringify(findings));
  console.log(`[Context Manager] Original context size: ${originalTokens.toLocaleString()} tokens`);

  const client = await createAIClient(aiProvider);

  const summarizationPrompt = `
You are coordinating a security investigation. Multiple agents have completed their work. Summarize their findings.

FINDINGS FROM ALL AGENTS:
${JSON.stringify(findings, null, 2)}

CONVERSATION HISTORY (RECENT):
${conversationHistory.slice(-10).map(m => `[${m.role}${m.agent_name ? ':' + m.agent_name : ''}] ${m.content}`).join('\n')}

YOUR TASK:
Create a consolidated summary that preserves critical security information:

OUTPUT FORMAT (JSON):
{
  "investigation_summary": "High-level overview of the investigation",
  "key_findings_by_agent": {
    "agent_name": "What this agent found"
  },
  "critical_iocs": ["All IOCs discovered across agents"],
  "attack_timeline": ["Sequence of events"],
  "confidence": 0.0-1.0
}

Be concise but comprehensive.
`;

  const response = await client.chat([
    {
      role: 'system',
      content: 'You are a security operations center coordinator summarizing investigation findings.'
    },
    {
      role: 'user',
      content: summarizationPrompt
    },
  ], {
    maxTokens: 3000,
    temperature: 0.3,
  });

  const summary = parseJSON(response.content);

  // Create summarized findings - keep agent structure but with condensed data
  const summarizedFindings: Record<string, any> = {};

  for (const [agentName, findingData] of Object.entries(findings)) {
    summarizedFindings[agentName] = {
      agent: agentName,
      summary: summary.key_findings_by_agent?.[agentName] || 'No summary available',
      iterations: (findingData as any).iterations || 0,
      // Remove detailed data, keep only summary
    };
  }

  // Add global summary
  summarizedFindings['_investigation_summary'] = {
    summary: summary.investigation_summary,
    critical_iocs: summary.critical_iocs || [],
    attack_timeline: summary.attack_timeline || [],
    confidence: summary.confidence,
    summarized_at: new Date(),
  };

  const summarizedTokens = estimateTokenCount(JSON.stringify(summarizedFindings));

  console.log(`[Context Manager] Investigation summarization complete:`);
  console.log(`  - Original: ${originalTokens.toLocaleString()} tokens`);
  console.log(`  - Summarized: ${summarizedTokens.toLocaleString()} tokens`);
  console.log(`  - Reduction: ${((1 - summarizedTokens / originalTokens) * 100).toFixed(1)}%`);

  return {
    summarizedFindings,
    summary: {
      originalTokenCount: originalTokens,
      summarizedTokenCount: summarizedTokens,
      keyFindings: summary.investigation_summary || '',
      criticalLogs: [],
      discardedLogsCount: 0,
      timestamp: new Date(),
    },
  };
}

/**
 * Parse JSON from LLM response
 */
function parseJSON(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/```json\s*\n([\s\S]+?)\n```/) || content.match(/```\s*\n(\{[\s\S]+?\})\n```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch { }
    }
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch { }
    }
    return { analysis: content, raw: content };
  }
}

/**
 * Load memory context for investigation (from Neo4j and PostgreSQL)
 * Provides historical intelligence to agents
 */
export async function loadMemoryContext(
  investigationId: string,
  alertData: any
): Promise<{
  relatedInvestigations: any[];
  suggestedQueries: any[];
  falsePositives: any[];
  tokenCount: number;
  formattedContext: string;
}> {
  console.log(`[Context Manager] Loading memory context for investigation ${investigationId}`);

  try {
    // Dynamically import memory services (to avoid circular dependencies)
    // Dynamically import memory services (to avoid circular dependencies)
    const { findRelatedFindings, extractEntities } = await import('@/lib/memory/graph-memory');
    const { suggestQueriesForAlert } = await import('@/lib/memory/query-memory');
    const { prisma } = await import('@/lib/db');

    // 1. Find related investigations from graph (via shared entities)
    let relatedInvestigations: any[] = [];
    let entities: { type: any; value: string }[] = [];

    try {
      // Extract entities from alert data
      const alertStr = JSON.stringify(alertData);
      entities = extractEntities(alertStr, alertData);

      if (entities.length > 0) {
        // Find findings related to these entities
        // findRelatedFindings takes an array of entities and returns a flat list of findings
        const allRelatedFindings = await findRelatedFindings(entities);

        // Deduplicate findings and extract investigation IDs (originalId)
        const uniqueInvestigationIds = new Set<string>();
        allRelatedFindings.forEach(item => {
          if (item.originalId && item.originalId !== investigationId) {
            uniqueInvestigationIds.add(item.originalId);
          }
        });

        if (uniqueInvestigationIds.size > 0) {
          const investigationIds = Array.from(uniqueInvestigationIds);
          const investigationDetails = await prisma.investigation.findMany({
            where: { id: { in: investigationIds } },
            include: { alert: true },
            orderBy: { createdAt: 'desc' },
            take: 5 // Limit to 5 most recent related investigations
          });

          // Map back to expected format
          relatedInvestigations = investigationDetails.map(details => {
            return {
              investigationId: details.id,
              sharedEntities: 'Multiple', // Simplified for now
              sharedEntityTypes: [], // Simplified
              alert: details.alert,
              status: details.status,
              findings: details.findings,
              createdAt: details.createdAt
            };
          });
        }
      }
    } catch (error) {
      console.warn('[Context Manager] Could not load related investigations:', error);
    }

    // 2. Get suggested queries based on alert similarity
    let suggestedQueries: any[] = [];
    try {
      suggestedQueries = await suggestQueriesForAlert(alertData, 10);
    } catch (error) {
      console.warn('[Context Manager] Could not load suggested queries:', error);
    }

    // 3. Check for known false positives
    let falsePositives: any[] = [];
    try {
      // Entities already extracted above
      if (entities.length > 0) {
        const entityValues = entities.map(e => e.value);
        falsePositives = await prisma.iOCWhitelist.findMany({
          where: {
            isActive: true,
            value: { in: entityValues },
          },
        });
      }
    } catch (error) {
      console.warn('[Context Manager] Could not load false positive history:', error);
    }

    // Format memory context for agents
    const contextParts: string[] = [];

    // Related Investigations Section
    if (relatedInvestigations.length > 0) {
      contextParts.push('## RELATED PAST INVESTIGATIONS');
      contextParts.push(`Found ${relatedInvestigations.length} related investigation(s) with shared entities:\n`);

      relatedInvestigations.forEach((inv, idx) => {
        contextParts.push(`### ${idx + 1}. Investigation from ${new Date(inv.createdAt).toLocaleDateString()}`);
        contextParts.push(`   - Shared Entities: ${inv.sharedEntities} (Types: ${inv.sharedEntityTypes.join(', ')})`);
        if (inv.alert) {
          contextParts.push(`   - Alert: ${inv.alert.title} (Severity: ${inv.alert.severity})`);
        }
        if (inv.findings) {
          const findingsStr = typeof inv.findings === 'string'
            ? inv.findings
            : JSON.stringify(inv.findings).substring(0, 300);
          contextParts.push(`   - Key Findings: ${findingsStr}...`);
        }
        contextParts.push('');
      });
    }

    // Suggested Queries Section
    if (suggestedQueries.length > 0) {
      contextParts.push('## SUGGESTED QUERIES (from past successful investigations)');
      contextParts.push(`Found ${suggestedQueries.length} effective quer${suggestedQueries.length === 1 ? 'y' : 'ies'} for similar alerts:\n`);

      suggestedQueries.slice(0, 5).forEach((sq, idx) => {
        contextParts.push(`### ${idx + 1}. ${sq.name}`);
        contextParts.push(`   - Effectiveness Score: ${sq.effectivenessScore}/100`);
        contextParts.push(`   - Similarity to Current Alert: ${(sq.similarity * 100).toFixed(0)}%`);
        contextParts.push(`   - Category: ${sq.category}`);
        if (sq.description) {
          contextParts.push(`   - Description: ${sq.description}`);
        }
        contextParts.push(`   - Query: ${sq.query.substring(0, 200)}${sq.query.length > 200 ? '...' : ''}`);
        contextParts.push('');
      });
    }

    // False Positives Section
    if (falsePositives.length > 0) {
      contextParts.push('## KNOWN FALSE POSITIVES');
      contextParts.push(`⚠️  Found ${falsePositives.length} whitelisted entit${falsePositives.length === 1 ? 'y' : 'ies'} in this alert:\n`);

      falsePositives.forEach((fp) => {
        contextParts.push(`- ${fp.type.toUpperCase()}: ${fp.value}`);
        if (fp.reason) {
          contextParts.push(`  Reason: ${fp.reason}`);
        }
        contextParts.push('');
      });

      contextParts.push('⚠️  Consider these as likely false positives when analyzing findings.\n');
    }

    const formattedContext = contextParts.join('\n');
    const tokenCount = estimateTokenCount(formattedContext);

    console.log(`[Context Manager] Memory context loaded:`);
    console.log(`  - Related investigations: ${relatedInvestigations.length}`);
    console.log(`  - Suggested queries: ${suggestedQueries.length}`);
    console.log(`  - Known false positives: ${falsePositives.length}`);
    console.log(`  - Token count: ${tokenCount.toLocaleString()}`);

    return {
      relatedInvestigations,
      suggestedQueries,
      falsePositives,
      tokenCount,
      formattedContext,
    };
  } catch (error) {
    console.error('[Context Manager] Error loading memory context:', error);
    return {
      relatedInvestigations: [],
      suggestedQueries: [],
      falsePositives: [],
      tokenCount: 0,
      formattedContext: '',
    };
  }
}
