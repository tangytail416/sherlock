/**
 * Agentic Workflow Implementation
 * Based on ReAct (Reasoning + Acting) pattern with Supervisor orchestration
 * 
 * Architecture:
 * 1. Orchestrator (Supervisor) - Routes tasks and receives feedback
 * 2. Specialist Agents (Workers) - Autonomous investigation with tool calling
 * 3. Reflection Loop - Agents report findings back to orchestrator
 * 4. State Management - Track investigation progress
 */

import { prisma } from '@/lib/db';
import { createAIClient } from '@/lib/ai';
import { generateJudgeChallenge } from './judge-evaluator';
import { createSplunkClientFromDB } from '@/lib/splunk/client';
import { loadAgentConfig } from './config-loader';
import { getActiveWhitelistedIOCs, getWhitelistAsJSON, filterWhitelistedFromSplunkResults } from './whitelist-helper';
import { emitAgentEvent } from '@/lib/socket/emitter';
import {
  calculateContextTokens,
  summarizeAgentContext,
  estimateTokenCount,
  loadMemoryContext
} from './context-manager';
import { loadAllGuides } from './guide-loader';
import { chatWithContextManagement } from './ai-client-wrapper';
import { generateInvestigationReport } from './report-generator';
import type { AgentConfig, AffectedEntities, TitleDetail } from './types';

export function formatSnakeCase(input: string): string {
  return input
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractPrimaryEntity(entities: AffectedEntities): string {
  if (entities.users?.length) return entities.users[0];
  if (entities.hosts?.length) return entities.hosts[0];
  if (entities.ips?.length) return entities.ips[0];
  return 'Unknown entity';
}

export function generateAlertTitle(
  findingType: string,
  titleDetail?: TitleDetail,
  affectedEntities?: AffectedEntities
): string {
  const threatType = formatSnakeCase(findingType);
  
  if (titleDetail?.primary_entity && titleDetail?.key_detail) {
    return `${threatType}: ${titleDetail.primary_entity} - ${titleDetail.key_detail}`;
  }
  
  if (affectedEntities) {
    const entity = extractPrimaryEntity(affectedEntities);
    return `${threatType}: ${entity}`;
  }
  
  return threatType;
}

export interface UserMessage {
  id: string;
  message: string;
  timestamp: Date;
  scope: 'active_agent' | 'investigation';
  acknowledged: boolean;
  acknowledgedBy: string | null;
  routedToOrchestrator: boolean;
}

export interface AgenticState {
  investigation_id: string;
  alert_data: any;
  current_phase: 'planning' | 'investigation' | 'synthesis' | 'complete';
  conversation_history: ConversationMessage[];
  findings: Record<string, any>;
  next_steps: string[];
  completed_agents: string[];
  iteration: number;
  max_iterations: number;
  user_messages: UserMessage[];
}

export interface ConversationMessage {
  role: 'orchestrator' | 'agent' | 'system';
  agent_name?: string;
  content: string;
  timestamp: Date;
  action?: 'plan' | 'investigate' | 'query' | 'report';
  metadata?: any;
}

export interface AgentTask {
  agent_name: string;
  instruction: string;
  context: any;
  previous_findings: any[];
}

/**
 * Main agentic workflow executor
 * Can resume from existing state if investigation was interrupted
 */
export async function executeAgenticWorkflow(
  investigationId: string,
  alertData: any,
  aiProvider: string
): Promise<void> {
  // Check if investigation has existing state (resume scenario)
  const existingInvestigation = await prisma.investigation.findUnique({
    where: { id: investigationId },
    include: {
      agentExecutions: {
        where: {
          status: 'completed',
          OR: [
            { errorMessage: null },
            { errorMessage: { not: 'Superseded by restart' } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const isResume = existingInvestigation && existingInvestigation.agentExecutions.length > 0;

  // Initialize or reconstruct state
  const state: AgenticState = {
    investigation_id: investigationId,
    alert_data: alertData,
    current_phase: isResume ? 'investigation' : 'planning',
    conversation_history: [],
    findings: {},
    next_steps: [],
    completed_agents: [],
    iteration: 0,
    max_iterations: 50,
    user_messages: [],
  };

  // Reconstruct state from existing executions if resuming
  if (isResume && existingInvestigation) {
    console.log(`[Agentic Workflow] Resuming investigation ${investigationId}`);

    // Rebuild findings and completed agents from database
    for (const execution of existingInvestigation.agentExecutions) {
      if (execution.result) {
        const fullReport = execution.result as any;

        // Store condensed summary instead of full report
        const keySummary = {
          agent: execution.agentName,
          iterations: fullReport.iterations || 0,
          key_findings: fullReport.summary || fullReport.key_findings || {},
          total_queries: fullReport.findings?.filter((f: any) => f.query).length || 0,
        };

        state.findings[execution.agentName] = keySummary;
        state.completed_agents.push(execution.agentName);
      }
    }

    // Restore existing findings from investigation (if any were saved)
    if (existingInvestigation.findings) {
      const savedFindings = existingInvestigation.findings as any;
      // Merge but prioritize condensed summaries from executions
      for (const [agentName, finding] of Object.entries(savedFindings)) {
        if (!state.findings[agentName]) {
          state.findings[agentName] = finding;
        }
      }
    }

    console.log(`[Agentic Workflow] Restored ${Object.keys(state.findings).length} agent findings`);
    console.log(`[Agentic Workflow] Completed agents: ${state.completed_agents.join(', ')}`);

    // Start with reflection to determine next steps based on existing findings
    await orchestratorReflection(state, aiProvider);
  } else {
    console.log(`[Agentic Workflow] Starting new investigation ${investigationId}`);

    // Initialize investigation graph in Neo4j
    try {
      const { addFindingToGraph, extractEntities } = await import('@/lib/memory/graph-memory');
      const { NodeLabel } = await import('@/lib/neo4j/schema');
      const alert = await prisma.alert.findUnique({ where: { id: alertData.id } });

      if (alert) {
        // Extract entities from alert data
        const entities = extractEntities(JSON.stringify(alertData), alertData);

        // Add Alert as the initial Finding node and link entities
        await addFindingToGraph(
          alert.id, // Use alert ID as finding ID
          alert.id, // Original ID is also alert ID
          `Initial Alert: ${alert.title}`,
          alert.severity,
          'alert-system',
          [], // No explicit relationships yet
          entities // Link extracted entities
        );

        console.log(`[Agentic Workflow] Initialized graph with ${entities.length} entities from alert`);
      }
    } catch (error) {
      console.warn('[Agentic Workflow] Failed to initialize investigation graph:', error);
    }

    // Phase 1: Initial Planning by Orchestrator
    await orchestratorPlanning(state, aiProvider);
  }

  // Phase 2: Investigation Loop
  while (state.current_phase === 'investigation' && state.iteration < state.max_iterations) {
    state.iteration++;
    console.log(`[Agentic Workflow] Iteration ${state.iteration}/${state.max_iterations}`);

    // Check if investigation has been stopped
    const currentInvestigation = await prisma.investigation.findUnique({
      where: { id: investigationId },
      select: { status: true },
    });

    if (currentInvestigation?.status === 'stopped') {
      console.log('[Agentic Workflow] Investigation stopped by user');
      return; // Exit workflow gracefully
    }

    // Execute next step if available
    if (state.next_steps.length > 0) {
      const nextAgent = state.next_steps.shift()!;

      // Execute specialist agent autonomously
      await executeSpecialistAgent(state, nextAgent, aiProvider);

      // Agent reports back to orchestrator
      await orchestratorReflection(state, aiProvider);
    } else {
      // No more steps, move to synthesis
      state.current_phase = 'synthesis';
    }
  }

  // Phase 3: Final Synthesis
  if (state.iteration >= state.max_iterations) {
    console.log('[Agentic Workflow] Max iterations reached');
  }

  console.log('[Agentic Workflow] Generating final report...');
  await generateInvestigationReport({
    investigationId,
    aiProvider,
    includeGraphContext: true,
  });
  state.current_phase = 'complete';
  console.log('[Agentic Workflow] Final report created');

  // Auto-save effective queries to query memory
  try {
    const { autoSaveQuery } = await import('@/lib/memory/query-memory');
    const allExecutions = await prisma.agentExecution.findMany({
      where: { investigationId },
      orderBy: { createdAt: 'asc' },
    });

    console.log('[Agentic Workflow] Analyzing queries for auto-save...');
    let savedCount = 0;

    for (const execution of allExecutions) {
      if (execution.result && typeof execution.result === 'object') {
        const result = execution.result as any;
        if (result.findings && Array.isArray(result.findings)) {
          // Find queries that produced findings
          const queriesWithResults = result.findings.filter(
            (f: any) => f.action === 'query' && f.results && f.results.length > 0
          );

          for (const queryFinding of queriesWithResults) {
            const autoSaveResult = await autoSaveQuery(
              queryFinding.query,
              investigationId,
              queryFinding.results,
              queryFinding.results.length
            );

            if (autoSaveResult.saved) {
              savedCount++;
              console.log(`  ✓ Auto-saved query with score ${autoSaveResult.score}/100`);
            }
          }
        }
      }
    }

    console.log(`[Agentic Workflow] Auto-saved ${savedCount} effective queries`);
  } catch (error) {
    console.warn('[Agentic Workflow] Failed to auto-save queries:', error);
  }

  // Update investigation status in Neo4j graph
  // Note: Investigation nodes were removed in refactor, so this is no longer needed
  // try {
  //   const { updateInvestigationStatus } = await import('@/lib/memory/graph-memory');
  //   await updateInvestigationStatus(investigationId, 'completed');
  //   console.log('[Agentic Workflow] Investigation status updated in Neo4j');
  // } catch (error) {
  //   console.warn('[Agentic Workflow] Failed to update investigation status in graph:', error);
  // }

  // Mark investigation as completed
  await prisma.investigation.update({
    where: { id: investigationId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      findings: state.findings,
    },
  });

  console.log(`[Agentic Workflow] Investigation ${investigationId} completed`);
}

/**
 * Orchestrator Planning Phase
 * Creates initial investigation plan and determines which agents to deploy
 */
async function orchestratorPlanning(state: AgenticState, aiProvider: string): Promise<void> {
  console.log('[Orchestrator] Planning phase - creating investigation plan');

  const config = await loadAgentConfig('orchestrator');
  if (!config) throw new Error('Orchestrator config not found');

  const client = await createAIClient(aiProvider);

  // Load memory context (related investigations, suggested queries, false positives)
  let memoryContext = '';
  try {
    const memory = await loadMemoryContext(state.investigation_id, state.alert_data);
    memoryContext = memory.formattedContext;
    if (memoryContext) {
      console.log(`[Orchestrator] Memory context loaded: ${memory.tokenCount.toLocaleString()} tokens`);
      console.log(`  - Related investigations: ${memory.relatedInvestigations.length}`);
      console.log(`  - Suggested queries: ${memory.suggestedQueries.length}`);
      console.log(`  - Known false positives: ${memory.falsePositives.length}`);
    }
  } catch (error) {
    console.warn('[Orchestrator] Failed to load memory context:', error);
  }

  // Fetch whitelisted IOCs
  const whitelistedIOCs = await getActiveWhitelistedIOCs();
  const whitelistJSON = getWhitelistAsJSON(whitelistedIOCs);
  const whitelistSection = whitelistedIOCs.length > 0
    ? `\n\n=== WHITELISTED IOCs (KNOWN SAFE - MUST EXCLUDE) ===\n${whitelistJSON}\n\nCRITICAL: These IOCs are verified safe and MUST be excluded from investigation. Do NOT deploy agents to investigate these entities.\n`
    : '';

  const splunkIndexes = `\n\nAVAILABLE SPLUNK INDEXES:\ncloudtrail, vpcflow, linux, windows, cloudwatch, aws-metadata, loadbalancer, waf, amazonq\n`;

  const memorySection = memoryContext ? `\n\n=== HISTORICAL INTELLIGENCE ===\n${memoryContext}\n` : '';

  // Check initial context size
  const initialTokens = estimateTokenCount(JSON.stringify(state.alert_data));
  console.log(`[Orchestrator] Initial alert context size: ${initialTokens.toLocaleString()} tokens`);

  const planningPrompt = `
You are the Orchestrator Agent coordinating a security investigation.

ALERT DETAILS:
${JSON.stringify(state.alert_data, null, 2)}${whitelistSection}${splunkIndexes}${memorySection}

YOUR TASK:
Analyze this alert and create an investigation plan. Determine which specialist agents should investigate and in what order.

AVAILABLE AGENTS:
- context_enrichment: Enriches entities (users, IPs, hosts, hashes)
- authentication_investigation: Investigates authentication events
- endpoint_behavior: Analyzes processes and endpoint activity
- malware_analysis: Investigates malware and file behavior
- aws-cloudtrail-investigation: AWS CloudTrail analysis
- aws-cloudwatch-logs-investigation: AWS CloudWatch Logs analysis
- aws-cloudwatch-metrics-investigation: AWS CloudWatch Metrics analysis
- aws-vpc-flowlogs-investigation: AWS VPC Flow Logs analysis
- timeline_correlation: Builds attack timeline
- case_correlation: Finds related cases
- report_generator: Creates final report

NOTE: You can call the same agent multiple times if needed for different aspects of investigation.

OUTPUT FORMAT (JSON):
{
  "reasoning": "Why these agents in this order",
  "next_steps": ["agent1", "agent2", "agent3"],
  "investigation_focus": "What to investigate"
}
`;

  let response;
  try {
    response = await client.chat([
      { role: 'system', content: config.prompts.system },
      { role: 'user', content: planningPrompt },
    ]);
  } catch (error: any) {
    // If context too large on initial planning, try with minimal context
    if (error.message?.includes('Context too large')) {
      console.log('[Orchestrator] Context too large on initial planning, retrying with minimal context');
      const minimalPrompt = `Analyze this alert and create a basic investigation plan.\n\nALERT: ${JSON.stringify(state.alert_data)}`;
      response = await client.chat([
        { role: 'system', content: config.prompts.system },
        { role: 'user', content: minimalPrompt },
      ]);
    } else {
      throw error;
    }
  }

const plan = parseJSON(response.content);

  // Update state - ensure it's an array to prevent crashes
  let plannedSteps = Array.isArray(plan.next_steps) ? plan.next_steps : [];
  
  // Guarantee report_generator is absolute last in the queue
  if (plannedSteps.includes('report_generator')) {
    plannedSteps = plannedSteps.filter((s: string) => s !== 'report_generator');
    plannedSteps.push('report_generator');
  }
  
  state.next_steps = plannedSteps;
  state.current_phase = 'investigation';
  
  // Use state.next_steps (which is guaranteed to be an array) and fallback for reasoning
  state.conversation_history.push({
    role: 'orchestrator',
    content: `Investigation Plan: ${plan.reasoning || 'None'}. Next steps: ${state.next_steps.join(' → ')}`,
    timestamp: new Date(),
    action: 'plan',
    metadata: plan,
  });

  // Store planning execution
  await prisma.agentExecution.create({
    data: {
      investigationId: state.investigation_id,
      agentName: 'orchestrator',
      status: 'completed',
      result: plan,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  // Also fix the console log here
  console.log(`[Orchestrator] Plan created: ${state.next_steps.join(' → ')}`);
}

/**
 * Execute Specialist Agent with Autonomous Investigation
 * Agent can query Splunk, make decisions, and loop until satisfied
 */
async function executeSpecialistAgent(
  state: AgenticState,
  agentName: string,
  aiProvider: string
): Promise<void> {
  console.log(`[Agent: ${agentName}] Starting autonomous investigation...`);

  const config = await loadAgentConfig(agentName);
  if (!config) {
    console.error(`[Agent: ${agentName}] Config not found`);
    return;
  }

  const execution = await prisma.agentExecution.create({
    data: {
      investigationId: state.investigation_id,
      agentName,
      status: 'running',
      startedAt: new Date(),
    },
  });

  try {
    const client = await createAIClient(aiProvider);
    const splunkClient = await createSplunkClientFromDB();

    // Fetch whitelisted IOCs for filtering query results
    const whitelists = await getActiveWhitelistedIOCs();
    console.log(`[Agent: ${agentName}] Loaded ${whitelists.length} active whitelisted IOCs for filtering`);

    // Load guides to append to system prompt
    const guides = await loadAllGuides();

    // Agent's autonomous investigation loop
    let agentComplete = false;
    let agentIteration = 0;
    const maxAgentIterations = 20; // Reduced from 50 to prevent excessive loops
    const agentFindings: any[] = [];
    let judgeHasChallenged = false;

    while (!agentComplete && agentIteration < maxAgentIterations) {
      agentIteration++;
      console.log(`[Agent: ${agentName}] Iteration ${agentIteration}/${maxAgentIterations}`);

      // Check if investigation has been stopped
      const currentInvestigation = await prisma.investigation.findUnique({
        where: { id: state.investigation_id },
        select: { status: true },
      });

      if (currentInvestigation?.status === 'stopped') {
        console.log(`[Agent: ${agentName}] Investigation stopped by user, terminating agent`);
        agentComplete = true;
        agentFindings.push({
          iteration: agentIteration,
          action: 'report',
          analysis: {
            status: 'stopped',
            reason: 'Investigation stopped by user',
            partial_findings: agentFindings.slice(-3),
          },
        });
        break;
      }

      // Check for user steering messages
      const globalStates = (global as any).investigationStates;
      if (globalStates && globalStates[state.investigation_id]) {
        const globalState = globalStates[state.investigation_id];
        
        // Get unacknowledged active_agent messages
        const activeAgentMessages = (globalState.user_messages || []).filter(
          (msg: any) => msg.scope === 'active_agent' && !msg.acknowledged
        );

        // Check for message timeout (5 minutes) and route to orchestrator
        const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
        const now = new Date();
        
        for (const msg of globalState.user_messages || []) {
          if (
            msg.scope === 'active_agent' &&
            !msg.acknowledged &&
            !msg.routedToOrchestrator &&
            (now.getTime() - new Date(msg.timestamp).getTime()) > TIMEOUT_MS
          ) {
            console.log(`[Agent: ${agentName}] ⏱️  User message ${msg.id} timed out, routing to orchestrator`);
            
            // Route to orchestrator
            msg.routedToOrchestrator = true;
            msg.scope = 'investigation';
            
            // Emit routing event
            emitAgentEvent({
              investigationId: state.investigation_id,
              agentName: 'system',
              phase: 'message_routed_to_orchestrator',
              data: {
                messageId: msg.id,
                originalMessage: msg.message,
                reason: 'Active agent did not acknowledge within 5 minutes',
                timestamp: now.toISOString(),
              },
              timestamp: now,
            });
          }
        }

        // Process active agent messages for current agent
        if (activeAgentMessages.length > 0) {
          console.log(`[Agent: ${agentName}] 📨 ${activeAgentMessages.length} unacknowledged user message(s) found`);
          
          // Build guidance section for prompt
          const userGuidance = activeAgentMessages.map((msg: any) => {
            const timeSince = Math.floor((now.getTime() - new Date(msg.timestamp).getTime()) / 1000);
            return `🚨 USER GUIDANCE (${timeSince}s ago): ${msg.message}`;
          }).join('\n\n');

          // Inject into agent findings as a special entry that will be in the prompt
          agentFindings.push({
            iteration: agentIteration,
            action: 'user_guidance',
            guidance: userGuidance,
            messages: activeAgentMessages.map((m: any) => ({ id: m.id, message: m.message })),
          });

          // Calculate new context size with user messages
          const newContextTokens = calculateContextTokens(
            state.alert_data,
            state.findings,
            agentFindings,
            state.conversation_history
          );

          // Emit token budget warning if context is large
          const CONTEXT_THRESHOLD = 90000;
          if (newContextTokens > CONTEXT_THRESHOLD) {
            console.log(`[Agent: ${agentName}] ⚠️  User message injection will trigger context summarization`);
            
            emitAgentEvent({
              investigationId: state.investigation_id,
              agentName,
              phase: 'token_budget_warning',
              data: {
                contextTokens: newContextTokens,
                threshold: CONTEXT_THRESHOLD,
                message: 'Your message will be processed after context compression (~30s delay)',
                estimatedDelay: '~30s',
              },
              timestamp: now,
            });
          }

          // Mark messages as acknowledged
          for (const msg of activeAgentMessages) {
            msg.acknowledged = true;
            msg.acknowledgedBy = agentName;

            // Emit acknowledgment event
            emitAgentEvent({
              investigationId: state.investigation_id,
              agentName,
              phase: 'agent_acknowledged_message',
              data: {
                messageId: msg.id,
                message: msg.message,
                acknowledgedBy: agentName,
                timestamp: now.toISOString(),
              },
              timestamp: now,
            });

            console.log(`[Agent: ${agentName}] ✅ Acknowledged user message ${msg.id}`);
          }

          // Sync back to state
          state.user_messages = globalState.user_messages;
        }
      }

      // Detect if agent is stuck (repeating same query without progress)
      if (agentIteration > 3) {
        const lastFive = agentFindings.slice(-5).filter(f => f.action === 'query');
        const uniqueQueries = new Set(lastFive.map(f => f.query?.trim()));

        if (uniqueQueries.size === 1 && lastFive.length >= 4) {
          const stuckQuery = lastFive[0].query;
          console.warn(`[Agent: ${agentName}] ⚠️  Agent stuck: repeating same query for ${lastFive.length} iterations`);
          console.log(`[Agent: ${agentName}] Stuck query: ${stuckQuery?.substring(0, 100)}...`);
          console.log(`[Agent: ${agentName}] Forcing report with current findings`);

          agentComplete = true;
          agentFindings.push({
            iteration: agentIteration,
            action: 'report',
            analysis: {
              status: 'completed',
              note: 'Agent was stuck repeating the same query. Forcing completion to prevent infinite loop.',
              stuck_query: stuckQuery,
              iterations_stuck: lastFive.length,
              findings_summary: `Agent executed ${agentFindings.filter(f => f.action === 'query').length} queries before getting stuck.`,
            },
          });
          break;
        }
      }

      // Check context size before building prompt
      const contextTokens = calculateContextTokens(
        state.alert_data,
        state.findings,
        agentFindings,
        state.conversation_history
      );

      // Emit token usage event for monitoring
      const tokenUsagePercent = (contextTokens / 120000) * 100;
      if (tokenUsagePercent > 70) {
        emitAgentEvent({
          investigationId: state.investigation_id,
          agentName,
          phase: 'thinking',
          data: {
            iteration: agentIteration,
            action: 'token_warning',
            contextTokens,
            usagePercent: tokenUsagePercent.toFixed(1),
            warning: tokenUsagePercent > 90 ? 'critical' : 'high',
          },
          timestamp: new Date(),
        });
      }

      // If context exceeds 90k tokens, summarize agent findings
      const CONTEXT_THRESHOLD = 90000;
      if (contextTokens > CONTEXT_THRESHOLD) {
        console.log(`[Agent: ${agentName}] ⚠️  Context size (${contextTokens.toLocaleString()} tokens) exceeds threshold (${CONTEXT_THRESHOLD.toLocaleString()})`);
        console.log(`[Agent: ${agentName}] Summarizing context to prevent token limit issues...`);

        const { summarizedFindings, summary } = await summarizeAgentContext(
          agentName,
          agentFindings,
          aiProvider
        );

        // Replace agent findings with summarized version
        agentFindings.length = 0; // Clear array
        agentFindings.push(...summarizedFindings);

        console.log(`[Agent: ${agentName}] ✅ Context summarized:`);
        console.log(`  - Token reduction: ${summary.originalTokenCount.toLocaleString()} → ${summary.summarizedTokenCount.toLocaleString()}`);
        console.log(`  - Critical logs kept: ${summary.criticalLogs.length}`);
        console.log(`  - Logs discarded: ${summary.discardedLogsCount}`);

        // Add summarization event to conversation history
        state.conversation_history.push({
          role: 'system',
          content: `Context summarized for ${agentName}. Reduced from ${summary.originalTokenCount.toLocaleString()} to ${summary.summarizedTokenCount.toLocaleString()} tokens. Kept ${summary.criticalLogs.length} critical log sets, discarded ${summary.discardedLogsCount} redundant logs.`,
          timestamp: new Date(),
          action: 'query',
          metadata: summary,
        });

        // Emit summarization event
        emitAgentEvent({
          investigationId: state.investigation_id,
          agentName,
          phase: 'thinking',
          data: {
            iteration: agentIteration,
            action: 'context_summarized',
            tokenReduction: `${summary.originalTokenCount.toLocaleString()} → ${summary.summarizedTokenCount.toLocaleString()}`,
            logsDiscarded: summary.discardedLogsCount,
          },
          timestamp: new Date(),
        });
      }

      // Build agent prompt with context (now async to fetch whitelist)
      let agentPrompt = await buildAgentPrompt(config, state, agentFindings);

      // Emit input event
      emitAgentEvent({
        investigationId: state.investigation_id,
        agentName,
        phase: 'input',
        data: {
          iteration: agentIteration,
          prompt: agentPrompt.substring(0, 500) + '...',
          config: config.name,
        },
        timestamp: new Date(),
      });

      // Agent reasons and acts - with automatic context management
      const neo4jEnabled = process.env.NEO4J_ENABLED !== 'false'; // Default to true
      let systemPromptWithGuides = config.prompts.system + guides;
      
      // Conditionally append Neo4j extraction instructions
      if (neo4jEnabled) {
        const { getNeo4jExtractionInstructions } = await import('@/lib/memory/graph-memory');
        systemPromptWithGuides += getNeo4jExtractionInstructions();
      }

      let response;
      let contextWasSummarized = false;

      try {
        response = await chatWithContextManagement(
          [
            { role: 'system', content: systemPromptWithGuides },
            { role: 'user', content: agentPrompt },
          ],
          {
            agentName,
            aiProvider,
            agentFindings,
            onContextSummarized: (summarizedFindings, summary) => {
              contextWasSummarized = true;
              // Store the summarization event
              state.conversation_history.push({
                role: 'system',
                content: `Context automatically summarized: ${summary.originalTokenCount.toLocaleString()} → ${summary.summarizedTokenCount.toLocaleString()} tokens`,
                timestamp: new Date(),
              });
            },
          },
          {
            temperature: config.model.temperature,
            maxTokens: config.model.max_tokens,
            maxRetries: 2, // Allow up to 2 retries with summarization
          }
        );

        // If context was summarized, we need to rebuild the prompt
        if (contextWasSummarized) {
          console.log(`[Agent: ${agentName}] Context was summarized, rebuilding prompt...`);
          agentPrompt = await buildAgentPrompt(config, state, agentFindings);
        }
      } catch (error: any) {
        console.error(`[Agent: ${agentName}] ❌ Failed after all retries:`, error.message);
        // Give up and report what we have
        agentComplete = true;
        agentFindings.push({
          iteration: agentIteration,
          action: 'report',
          error: error.message,
          analysis: {
            status: 'incomplete',
            reason: 'May have problem, but there are a few findings',
            partial_findings: agentFindings.slice(-3), // Last 3 findings
          },
        });
        break;
      }

      const agentDecision = parseJSON(response.content);
	  if ((agentName.includes('correlation') || agentName === 'report_generator') && !agentDecision.action) {
        agentDecision.action = 'report';
        agentDecision.complete = true;
      }

      // Safety check: if agent returns "continue" without a query, force it to report
      if (agentDecision.action === 'continue') {
        console.log(`[Agent: ${agentName}] ⚠️  Agent tried to use deprecated 'continue' action - forcing report`);
        agentDecision.action = 'report';
        agentDecision.analysis = agentDecision.analysis || {
          status: 'completed',
          note: 'Agent attempted to continue without taking action. Forcing completion with current findings.',
          reasoning: agentDecision.reasoning || 'No specific reasoning provided',
          findings: agentFindings.length > 0 ? agentFindings : ['No specific findings gathered'],
        };
      }

      // Emit thinking event
      emitAgentEvent({
        investigationId: state.investigation_id,
        agentName,
        phase: 'thinking',
        data: {
          iteration: agentIteration,
          reasoning: agentDecision.reasoning || agentDecision.analysis,
          action: agentDecision.action,
        },
        timestamp: new Date(),
      });

      // Check if agent wants to query Splunk
      if (agentDecision.action === 'query' && splunkClient && agentDecision.query) {
        console.log(`[Agent: ${agentName}] Executing Splunk query...`);

        // Ensure query starts with "search" command
        let searchQuery = agentDecision.query.trim();
        if (!searchQuery.startsWith('search ') && !searchQuery.startsWith('|') && !searchQuery.startsWith('tstats') && !searchQuery.startsWith('inputlookup')) {
          searchQuery = 'search ' + searchQuery;
        }

        // Check if this query was already executed (query deduplication)
        const previousQueries = agentFindings
          .filter(f => f.action === 'query' && !f.skipped)
          .map(f => f.query?.trim());

        if (previousQueries.includes(searchQuery.trim())) {
          const firstOccurrence = agentFindings.findIndex(
            f => f.action === 'query' && f.query?.trim() === searchQuery.trim()
          );

          console.warn(
            `[Agent: ${agentName}] ⚠️  Query already executed in iteration ${firstOccurrence + 1}. Skipping duplicate.`
          );
          console.log(`[Agent: ${agentName}] Duplicate query: ${searchQuery.substring(0, 100)}...`);

          // Add feedback to findings instead of running query
          agentFindings.push({
            iteration: agentIteration,
            action: 'query',
            query: searchQuery,
            skipped: true,
            reason: 'duplicate_query',
            results: [],
            guidance: `❌ This exact query was already executed in iteration ${firstOccurrence + 1}. ` +
              `It returned ${agentFindings[firstOccurrence].results?.length || 0} results. ` +
              `Please try a different query (different time range, index, or search terms) or report your findings.`,
          });

          // Emit event for UI
          emitAgentEvent({
            investigationId: state.investigation_id,
            agentName,
            phase: 'thinking',
            data: {
              iteration: agentIteration,
              query: searchQuery,
              action: 'query_skipped',
              reason: 'duplicate_query',
              previous_iteration: firstOccurrence + 1,
            },
            timestamp: new Date(),
          });

          // Continue to next iteration without executing query
          continue;
        }

        // Emit query event
        emitAgentEvent({
          investigationId: state.investigation_id,
          agentName,
          phase: 'query',
          data: {
            iteration: agentIteration,
            query: searchQuery,
            timeRange: { earliest: '-24m', latest: 'now' },
          },
          timestamp: new Date(),
        });

        console.log(`[Agent: ${agentName}] Query:\n${searchQuery}`);
        console.log(`[Agent: ${agentName}] Time range: -24h to now`);
        try {
          const queryResults = await splunkClient.oneshot(searchQuery, {
            earliestTime: '-24m',
            latestTime: 'now',
            maxResults: 250,
          });

          // Filter out whitelisted IOCs from results
          const { filtered, removedCount } = filterWhitelistedFromSplunkResults(queryResults, whitelists);
          const results = filtered;

          console.log(`[Agent: ${agentName}] Query SUCCESS: ${queryResults.length} results returned (${removedCount} filtered by whitelist, ${results.length} remaining)`);

          // Check token count of results
          const resultsTokenCount = estimateTokenCount(JSON.stringify(results));
          console.log(`[Agent: ${agentName}] Results token count: ${resultsTokenCount.toLocaleString()} tokens`);

          // If results are too large (>60k tokens), prompt agent to refine query
          const RESULTS_TOKEN_THRESHOLD = 60000;
          if (resultsTokenCount > RESULTS_TOKEN_THRESHOLD) {
            console.log(`[Agent: ${agentName}] ⚠️  Query results too large (${resultsTokenCount.toLocaleString()} tokens > ${RESULTS_TOKEN_THRESHOLD.toLocaleString()} threshold)`);

            // Emit warning event
            emitAgentEvent({
              investigationId: state.investigation_id,
              agentName,
              phase: 'query-results',
              data: {
                iteration: agentIteration,
                resultCount: results.length,
                tokenCount: resultsTokenCount,
                warning: 'Results too large - please refine query with more filters, aggregation or reduce time range',
              },
              timestamp: new Date(),
            });

            // Store a truncated version with guidance to refine
// Store a truncated version with guidance to refine
            agentFindings.push({
              iteration: agentIteration,
              action: 'query',
              query: searchQuery,
              reasoning: agentDecision.reasoning,
              
              // 1. Change the status to 'error' so the LLM knows the action failed
              result_summary: {
                status: 'error', 
                total_count: results.length,
                token_count: resultsTokenCount,
                message: `SYSTEM EXCEPTION: Token limit exceeded.`
              },
              
              // 2. Introduce an explicit 'error' field with a strict, non-conversational system log
              error: `QUERY REJECTED: Result size (${resultsTokenCount.toLocaleString()} tokens) exceeds the absolute system limit of ${RESULTS_TOKEN_THRESHOLD.toLocaleString()} tokens.`,
              
              // 3. Provide a strict directive instead of polite guidance
              system_directive: `CRITICAL ACTION REQUIRED: Your previous query crashed the context window. In your next iteration, you MUST write a new, highly-aggregated query. Append '| stats count by ...' or strictly limit rows using '| head 30'. DO NOT use 'values()' on high-variance fields like URIs or CommandLines.`,
              
              // 4. Shrink the sample size so it doesn't accidentally trigger the AI client rate limits we fixed earlier
              results: results.slice(0, 2) 
            });

            console.log(`[Agent: ${agentName}] Results truncated to 10 sample entries. Agent will be prompted to refine query.`);
          } else {
            // Results are manageable size
            // Emit query results event
            emitAgentEvent({
              investigationId: state.investigation_id,
              agentName,
              phase: 'query-results',
              data: {
                iteration: agentIteration,
                resultCount: results.length,
                tokenCount: resultsTokenCount,
                results: results.slice(0, 5), // Only send first 5 for preview
              },
              timestamp: new Date(),
            });

            agentFindings.push({
              iteration: agentIteration,
              action: 'query',
              query: searchQuery,
              results,
              result_summary: {
                total_count: results.length,
                token_count: resultsTokenCount,
                status: 'ok'
              },
              reasoning: agentDecision.reasoning,
            });

            // Detect repeated empty results
// Detect repeated empty results
            if (results.length === 0) {
              // Count how many of the MOST RECENT executed queries were empty
              const executedQueries = agentFindings.filter(f => f.action === 'query' && !f.skipped);
              let consecutiveEmptyCount = 0;
              
              for (let i = executedQueries.length - 1; i >= 0; i--) {
                if (executedQueries[i].results && executedQueries[i].results.length === 0) {
                  consecutiveEmptyCount++;
                } else {
                  break; // Stop counting as soon as we hit a successful query
                }
              }

              console.log(`[Agent: ${agentName}] Consecutive empty queries: ${consecutiveEmptyCount}`);

              // At exactly 3 in a row, warn the agent directly in its current finding
              if (consecutiveEmptyCount === 3) {
                console.warn(`[Agent: ${agentName}] THREE!!!!!!!!!!! consecutive empty queries. Issuing warning to agent.`);
                
                // Inject guidance into the finding we just pushed so the LLM sees it on the next loop
                const currentFinding = agentFindings[agentFindings.length - 1];
                currentFinding.guidance = `SYSTEM WARNING: Your last 3 queries have returned exactly 0 results. You are likely searching the wrong index, using incorrect field names, or applying overly strict filters. CRITICAL: You MUST completely change your search strategy in the next iteration. Broaden your search, try different sourcetypes, or if you believe the data does not exist, use action="report" to conclude this path.`;
              }

              // At 5 in a row, pull the plug
              if (consecutiveEmptyCount >= 6) {
                console.log(`[Agent: ${agentName}] Forcing completion after 6 consecutive empty results`);
                
                // Check if the agent actually found things in earlier queries
                const successfulQueries = agentFindings.filter(
                  f => f.action === 'query' && !f.skipped && f.results && f.results.length > 0
                );

                agentComplete = true;
                
                if (successfulQueries.length > 0) {
                  // Scenario A: It found evidence early on, but got stuck later
                  console.log(`[Agent: ${agentName}] Agent found evidence in ${successfulQueries.length} previous queries before getting stuck.`);
                  agentFindings.push({
                    iteration: agentIteration + 1,
                    action: 'report',
                    analysis: {
                      status: 'completed_with_findings',
                      note: 'Agent was forcefully completed after 5 consecutive queries failed, but evidence was successfully gathered in earlier iterations.',
                      queries_executed: agentFindings.filter(f => f.action === 'query' && !f.skipped).length,
                      successful_queries: successfulQueries.length,
                      conclusion: 'The investigation path was halted because the 5 most recent searches returned no results. However, actionable evidence was discovered in previous queries. Review the successful queries above.',
                    },
                    notable_entities: [],
                    notable_relationships: []
                  });
                } else {
                  // Scenario B: It found absolutely nothing the entire time
                  console.log(`[Agent: ${agentName}] Agent found absolutely zero evidence.`);
                  agentFindings.push({
                    iteration: agentIteration + 1,
                    action: 'report',
                    analysis: {
                      status: 'completed_empty',
                      note: 'Investigation completed after 5 consecutive queries returned no results.',
                      queries_executed: agentFindings.filter(f => f.action === 'query' && !f.skipped).length,
                      empty_results: consecutiveEmptyCount,
                      conclusion: 'No evidence found in the queried data sources. This could indicate either no malicious activity occurred, or the activity is not logged in the available data.',
                    },
                    notable_entities: [],
                    notable_relationships: []
                  });
                }
                break; // Exit the while loop
              }
            }}
        } catch (error: any) {
          console.error(`[Agent: ${agentName}] Query FAILED:`, error.message);
          console.error(`[Agent: ${agentName}] Failed query was:\n${searchQuery}`);
          console.error(`[Agent: ${agentName}] Error details:`, error);

          // Emit error event
          emitAgentEvent({
            investigationId: state.investigation_id,
            agentName,
            phase: 'error',
            data: {
              iteration: agentIteration,
              error: error.message,
              query: searchQuery,
            },
            timestamp: new Date(),
          });

          agentFindings.push({
            iteration: agentIteration,
            action: 'query',
            query: searchQuery,
            error: error.message,
          });
        }
      }

	if (agentDecision.action === 'report' || agentDecision.complete) {
        
        // --- NEW: THE JUDGE INTERCEPTION (ONE-AND-DONE) ---
        // Exclude the compilation agents from the Judge since their data is already verified!
        const isCompilingAgent = agentName === 'report_generator' || agentName.includes('correlation');
        
        if (!isCompilingAgent && !judgeHasChallenged) {
          console.log(`[Agent: ${agentName}] Agent wants to complete. Calling Judge...`);
          const judgeChallenge = await generateJudgeChallenge(
             aiProvider, 
             config.modelUsed || 'glm-5', 
             agentName, 
             agentDecision.analysis
          );

          if (judgeChallenge) {
              console.log(`[Judge] (WARNING) Challenge Issued: Forcing ${agentName} to verify findings.`);
              judgeHasChallenged = true; // Mark that the judge has spoken
              
              // Inject the Judge's challenge into the context
              agentFindings.push({
                 iteration: agentIteration,
                 action: 'judge_challenge',
                 system_directive: `THE REVIEWER HAS A CONFIRMATION REQUEST:\n\n"${judgeChallenge}"\n\nIf you ALREADY have the raw logs in your previous iterations to prove this, output action="report" and quote them. If not, output action="query" to confirm they are real. If you realize your claim was incorrect, revise your findings and output action="report".`,
              });
              // Force the loop to continue
              agentComplete = false;
              continue; 
          }
          console.log(`[Judge] (PASSED) Findings Approved.`);
          judgeHasChallenged = true; // Mark as approved so it doesn't run again
        }
        // -----------------------------------
        
        agentComplete = true;

        if (agentDecision.new_alerts && Array.isArray(agentDecision.new_alerts) && agentDecision.new_alerts.length > 0) {
          console.log(`[Agent: ${agentName}] 🚨 Agent discovered ${agentDecision.new_alerts.length} parallel threats. Generating new alerts...`);
          
          for (const alertDef of agentDecision.new_alerts) {
            try {
              const alertTitle = generateAlertTitle(
                alertDef.finding_type || 'suspicious_activity',
                alertDef.title_detail,
                alertDef.affected_entities
              );
              
              const newAlert = await prisma.alert.create({
                data: {
                  title: alertTitle,
                  severity: alertDef.severity || 'medium',
                  description: `${alertDef.description || 'Discovered during autonomous investigation.'}\n\nSpawned by agent: ${agentName}\nParent Investigation: ${state.investigation_id}`,
                  source: formatSnakeCase(agentName),
                  rawData: alertDef.raw_data || { parent_investigation: state.investigation_id },
                  status: 'new',
                }
              });

              console.log(`  -> Created Alert: ${newAlert.id} (${newAlert.title})`);

              // Add a record of this to the agent's findings so it appears in the final report
              agentFindings.push({
                iteration: agentIteration,
                action: 'spawned_alert',
                alert_id: newAlert.id,
                alert_title: newAlert.title,
                note: `Agent autonomously spawned a new alert for a parallel threat discovered during this investigation.`
              });

              // Optional: Emit a socket event so the UI can pop a toast notification!
              emitAgentEvent({
                investigationId: state.investigation_id,
                agentName,
                phase: 'alert_generated',
                data: { 
                  alertId: newAlert.id, 
                  title: newAlert.title, 
                  severity: newAlert.severity,
                  message: `New parallel threat detected and alert generated!`
                },
                timestamp: new Date(),
              });

            } catch (e) {
              console.error(`[Agent: ${agentName}] Failed to spawn alert:`, e);
            }
          }
        }
        agentFindings.push({
          iteration: agentIteration,
          action: 'report',
          analysis: agentDecision.analysis || agentDecision,
          confidence: agentDecision.confidence,
		  notable_entities: agentDecision.notable_entities || [],
          notable_relationships: agentDecision.notable_relationships || []
        });

        // Emit output event
        // Emit output event
        emitAgentEvent({
          investigationId: state.investigation_id,
          agentName,
          phase: 'output',
          data: {
            iteration: agentIteration,
            analysis: agentDecision.analysis || agentDecision,
            confidence: agentDecision.confidence,
          },
          timestamp: new Date(),
        });
      }
    } // End of while loop

    // Compile final report (full details)
    const finalReport = {
      agent: agentName,
      iterations: agentIteration,
      findings: agentFindings,
      summary: agentFindings[agentFindings.length - 1]?.analysis || {},
      token_stats: {
        final_context_tokens: estimateTokenCount(JSON.stringify(agentFindings)),
        summarization_performed: agentFindings.some(f => f.action === 'summary'),
      },
    };

    // Create condensed summary for orchestrator (key findings only)
    const keySummary = {
      agent: agentName,
      iterations: agentIteration,
      key_findings: agentFindings[agentFindings.length - 1]?.analysis || {},
      total_queries: agentFindings.filter(f => f.query).length,
    };

    // Update execution with full report
    await prisma.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: 'completed',
        result: finalReport,
        completedAt: new Date(),
      },
    });

    // Update state with condensed summary (not full report)
    state.findings[agentName] = keySummary;

    // Track this execution (allow multiple executions of same agent)
    const executionCount = state.completed_agents.filter(a => a === agentName).length + 1;
    state.completed_agents.push(agentName);

    state.conversation_history.push({
      role: 'agent',
      agent_name: agentName,
      content: `Completed investigation (execution #${executionCount}). Iterations: ${agentIteration}. Key findings available.`,
      timestamp: new Date(),
      action: 'report',
      metadata: keySummary,
    });

    // Write findings to Neo4j graph (if enabled)
    const neo4jEnabled = process.env.NEO4J_ENABLED !== 'false'; // Default to true
    
    if (neo4jEnabled) {
      try {
        const { addFindingToGraph } = await import('@/lib/memory/graph-memory');
        const { NodeLabel } = await import('@/lib/neo4j/schema');
        const findingText = JSON.stringify(finalReport.summary);


        const findFieldInObject = (obj: any, fieldName: string): any => {
          if (!obj || typeof obj !== 'object') return null;
          
          let emptyFallback = null;

          if (Array.isArray(obj)) {
            for (const item of obj) {
              const result = findFieldInObject(item, fieldName);
              // If we found a populated array, jackpot! Return it immediately.
              if (result && Array.isArray(result) && result.length > 0) return result;
              // If it's empty, remember it but keep looking
              if (result) emptyFallback = result;
            }
            return emptyFallback;
          }

          // Check if this object has the field
          if (obj[fieldName] !== undefined) {
            const val = obj[fieldName];
            if (Array.isArray(val) && val.length > 0) return val; 
            emptyFallback = val;
          }

          // Recursively search nested objects
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              const result = findFieldInObject(obj[key], fieldName);
              if (result && Array.isArray(result) && result.length > 0) return result;
              if (result) emptyFallback = result;
            }
          }

          return emptyFallback;
        };

        // Extract entities and relationships from anywhere in the agent's response
        // This searches the entire JSON structure, so agents can return these fields at any level
        const agentEntities = findFieldInObject(finalReport, 'notable_entities') || [];

        // Map agent relationship format to GraphRelationship interface
        // Agents return: { source, target, relationship, significance }
        // Interface expects: { source, target, type, description }
        const rawRelationships = findFieldInObject(finalReport, 'notable_relationships') || [];
        const agentRelationships = (Array.isArray(rawRelationships) ? rawRelationships : []).map((rel: any) => ({
          source: rel.source,
          target: rel.target,
          type: rel.relationship, // Map "relationship" field to "type"
          description: rel.significance || rel.description // Map "significance" to "description"
        }));

        // Validation and logging for Neo4j data quality
        const hasEntities = Array.isArray(agentEntities) && agentEntities.length > 0;
        const hasRelationships = Array.isArray(agentRelationships) && agentRelationships.length > 0;

        if (!hasEntities && !hasRelationships) {
          console.warn(`[Agent: ${agentName}] ⚠️  Neo4j WARNING: Agent returned NO entities or relationships. Check agent output schema and prompt instructions.`);
          console.warn(`[Agent: ${agentName}] ⚠️  Agent summary structure:`, Object.keys(finalReport.summary || {}));
        } else if (!hasRelationships) {
          console.warn(`[Agent: ${agentName}] ⚠️  Neo4j WARNING: Agent returned ${agentEntities.length} entities but NO relationships. Entity-to-entity connections will not be created.`);
        } else if (!hasEntities) {
          console.warn(`[Agent: ${agentName}] ⚠️  Neo4j WARNING: Agent returned ${agentRelationships.length} relationships but NO standalone entities.`);
        }

        // Validate relationship structure (after mapping)
        if (hasRelationships) {
          const invalidRelationships = agentRelationships.filter((rel: any) =>
            !rel.source || !rel.target || !rel.source.type || !rel.source.value ||
            !rel.target.type || !rel.target.value || !rel.type
          );
          if (invalidRelationships.length > 0) {
            console.error(`[Agent: ${agentName}] ❌ Neo4j ERROR: ${invalidRelationships.length} invalid relationships with missing required fields (source, target, type)`);
          }
        }

        // Extract MITRE ATT&CK techniques from findings if present
        const rawMitreData: any[] = [];
        if (finalReport.summary?.mitre_attack) {
          rawMitreData.push(finalReport.summary.mitre_attack);
        }
        if (finalReport.summary?.techniques) {
          // Handle both single objects and arrays of objects/strings
          if (Array.isArray(finalReport.summary.techniques)) {
            rawMitreData.push(...finalReport.summary.techniques);
          } else {
            rawMitreData.push(finalReport.summary.techniques);
          }
        }
        
        // Safely extract the string value, even if the LLM returned a nested object
        rawMitreData.forEach((item: any) => {
          let techniqueStr = '';
          
          if (typeof item === 'string') {
            techniqueStr = item;
          } else if (typeof item === 'object' && item !== null) {
            // Pluck the ID from common object keys LLMs use
            techniqueStr = item.techniqueID || item.id || item.technique_id || item.name || item.technique || '';
          }

          if (techniqueStr && typeof techniqueStr === 'string' && techniqueStr.trim() !== '') {
            agentEntities.push({ type: NodeLabel.Technique, value: techniqueStr.trim() });
          }
        });

        await addFindingToGraph(
          execution.id, // findingId
          state.investigation_id, // originalId
          findingText, // summary
          'info', // severity
          agentName, // source
          agentRelationships, // relationships from agent
          agentEntities // entities from agent
        );

        console.log(`[Agent: ${agentName}] ✓ Neo4j: ${agentEntities.length} entities, ${agentRelationships.length} relationships successfully added to knowledge graph`);
      } catch (error) {
        console.warn(`[Agent: ${agentName}] Failed to write findings to Neo4j graph:`, error);
      }
    }

    console.log(`[Agent: ${agentName}] Investigation completed after ${agentIteration} iterations (execution #${executionCount})`);
  } catch (error: any) {
    console.error(`[Agent: ${agentName}] Error:`, error.message);
    await prisma.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Orchestrator Reflection Phase
 * Reviews agent findings and decides next steps
 */
async function orchestratorReflection(state: AgenticState, aiProvider: string): Promise<void> {
  console.log('[Orchestrator] Reflecting on findings and planning next steps...');

  const config = await loadAgentConfig('orchestrator');
  if (!config) return;

  const client = await createAIClient(aiProvider);

  // Check for user steering messages for investigation scope
  const globalStates = (global as any).investigationStates;
  let userGuidanceSection = '';
  
  if (globalStates && globalStates[state.investigation_id]) {
    const globalState = globalStates[state.investigation_id];
    
    // Get unacknowledged investigation-scoped messages (including routed ones)
    const investigationMessages = (globalState.user_messages || []).filter(
      (msg: any) => msg.scope === 'investigation' && !msg.acknowledged
    );

    if (investigationMessages.length > 0) {
      console.log(`[Orchestrator] 📨 ${investigationMessages.length} unacknowledged investigation guidance message(s)`);
      
      const now = new Date();
      userGuidanceSection = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 USER STRATEGIC GUIDANCE 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The user has provided strategic direction for this investigation:

${investigationMessages.map((msg: any) => {
  const timeSince = Math.floor((now.getTime() - new Date(msg.timestamp).getTime()) / 1000);
  const routedNote = msg.routedToOrchestrator ? ' [Routed from active agent timeout]' : '';
  return `🚨 USER GUIDANCE (${timeSince}s ago)${routedNote}: ${msg.message}`;
}).join('\n\n')}

CRITICAL INSTRUCTIONS:
- Incorporate this user guidance into your next_steps planning
- Prioritize agents and investigation directions based on user input
- If user suggests skipping certain paths, remove those agents from next_steps
- If user recommends specific investigation areas, add appropriate agents
- Explain in your reasoning how you're addressing the user's guidance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      // Mark messages as acknowledged by orchestrator
      for (const msg of investigationMessages) {
        msg.acknowledged = true;
        msg.acknowledgedBy = 'orchestrator';

        // Emit acknowledgment event
        emitAgentEvent({
          investigationId: state.investigation_id,
          agentName: 'orchestrator',
          phase: 'agent_acknowledged_message',
          data: {
            messageId: msg.id,
            message: msg.message,
            acknowledgedBy: 'orchestrator',
            timestamp: now.toISOString(),
          },
          timestamp: now,
        });

        console.log(`[Orchestrator] ✅ Acknowledged user message ${msg.id}`);
      }

      // Sync back to state
      state.user_messages = globalState.user_messages;

      // Clean up acknowledged active_agent messages (retention policy)
      globalState.user_messages = globalState.user_messages.filter(
        (msg: any) => !(msg.scope === 'active_agent' && msg.acknowledged)
      );
    }
  }

  // Fetch whitelisted IOCs
  const whitelistedIOCs = await getActiveWhitelistedIOCs();
  const whitelistJSON = getWhitelistAsJSON(whitelistedIOCs);
  const whitelistSection = whitelistedIOCs.length > 0
    ? `\n\n=== WHITELISTED IOCs (KNOWN SAFE - ALREADY FILTERED) ===\n${whitelistJSON}\n\nNOTE: These IOCs have been filtered from agent findings and should not appear in reports.\n`
    : '';

  // Check context size before building prompt
  const contextTokens = calculateContextTokens(
    state.alert_data,
    state.findings,
    [],
    state.conversation_history
  );

  console.log(`[Orchestrator] Current context size: ${contextTokens.toLocaleString()} tokens`);

  // If context exceeds threshold, we're in a critical state
// If context exceeds threshold, we're in a critical state
  const CRITICAL_THRESHOLD = 150000;
  if (contextTokens > CRITICAL_THRESHOLD) {
    console.log(`[Orchestrator] ⚠️  Context size exceeds critical threshold (${CRITICAL_THRESHOLD.toLocaleString()} tokens)`);
    console.log(`[Orchestrator] Forcing investigation completion to prevent token overflow`);

    state.current_phase = 'synthesis';
    state.next_steps = [];

    state.conversation_history.push({
      role: 'system',
      content: `Investigation context exceeded critical threshold (${contextTokens.toLocaleString()} tokens). Forcing synthesis phase.`,
      timestamp: new Date(),
      action: 'plan',
    });

    return;
  }

  // --- NEW: FETCH FAILED AGENTS ---
  const failedExecutions = await prisma.agentExecution.findMany({
    where: { 
      investigationId: state.investigation_id,
      status: 'failed'
    },
    orderBy: { createdAt: 'desc' }
  });
  
  const failedAgentNames = [...new Set(failedExecutions.map(e => e.agentName))];
  const unresolvedFailures = failedAgentNames.filter(name => !state.completed_agents.includes(name));
  
  let failureWarning = '';
  if (unresolvedFailures.length > 0) {
    failureWarning = `\n\n🚨 CRITICAL SYSTEM WARNING: The following agents FAILED during execution and have not successfully completed: ${unresolvedFailures.join(', ')}.\nYou MUST re-add these agents to 'next_steps' to retry them. DO NOT set "complete": true or schedule 'report_generator' until these failures are successfully resolved.`;
  }
  // ---------------------------------

  const findingsArray = Array.isArray(state.findings) 
    ? state.findings 
    : Object.values(state.findings);

  const summarizedFindings = findingsArray.map((f: any) => ({
    agent: f.agent,                    
    iterations: f.iterations,
    total_queries: f.total_queries,
    key_findings: f.key_findings || [],  
    summary: f.key_findings || 'No summary available',
  }));

  // 👇 FIX 1: failureWarning added to the end of this line 👇
  const reflectionPrompt = `
You are the Orchestrator reviewing investigation progress.${whitelistSection}${userGuidanceSection}${failureWarning}

COMPLETED AGENTS: ${state.completed_agents.join(', ')}

FINDINGS SO FAR:
${JSON.stringify(summarizedFindings, null, 2)}

REMAINING STEPS: ${state.next_steps.join(', ') || 'None'}

IMPORTANT: You CAN re-run agents that have already completed if:
- New information suggests additional queries are needed
- Previous findings were incomplete or need deeper analysis
- Different context or parameters should be investigated
- Follow-up investigation is warranted based on other agents' findings

YOUR TASK:
Based on the findings, determine if:
1. Investigation is complete → set "complete": true
2. More investigation needed → add agents to "next_steps" (can include previously completed agents)
3. Different direction needed → modify "next_steps"

OUTPUT FORMAT (JSON):
{
  "assessment": "What we learned so far",
  "complete": false,
  "next_steps": ["agent_name"],
  "reasoning": "Why these next steps (mention if re-running an agent and why)"
}
`;

  const response = await client.chat([
    { role: 'system', content: config.prompts.system },
    { role: 'user', content: reflectionPrompt },
  ]);

  const reflection = parseJSON(response.content);

  // --- NEW: FORCED ARRAY OVERRIDE ---
  if (reflection.complete && unresolvedFailures.length === 0) {
    state.current_phase = 'synthesis';
    state.next_steps = [];
  } else {
    let nextSteps = Array.isArray(reflection.next_steps) ? reflection.next_steps : [];
    
    // Safety net: force unresolved failures back to the front if LLM ignored the warning
    for (const failedAgent of unresolvedFailures) {
      if (!nextSteps.includes(failedAgent)) {
         nextSteps.unshift(failedAgent);
         console.log(`[Orchestrator] Auto-injected failed agent ${failedAgent} into next_steps`);
      }
    }

    // Guarantee report_generator is absolute last
    if (nextSteps.includes('report_generator')) {
      nextSteps = nextSteps.filter((s: string) => s !== 'report_generator');
      nextSteps.push('report_generator');
    }

    state.next_steps = nextSteps;
    
    // If the LLM said complete: true but we had failures, override it
    if (reflection.complete) {
       console.log(`[Orchestrator] Overriding complete=true because of unresolved failures.`);
       reflection.complete = false;
    }
  }

  // 👇 FIX 2: Added the history save back in 👇
  state.conversation_history.push({
    role: 'orchestrator',
    content: `[ORCHESTRATOR ASSESSMENT]: ${reflection.assessment}\n[CRITICAL DIRECTIVE/REASONING]: ${reflection.reasoning}\n${reflection.complete && unresolvedFailures.length === 0 ? 'Investigation complete.' : `Next: ${state.next_steps?.join(', ')}`}`,
    timestamp: new Date(),
    action: 'plan',
    metadata: reflection,
  });

  console.log(`[Orchestrator] ${reflection.complete && unresolvedFailures.length === 0 ? 'Investigation complete' : `Next steps: ${state.next_steps?.join(', ')}`}`);
}

/**
 * Build agent prompt with full context
 */
/**
 * Build agent prompt with full context
 */
async function buildAgentPrompt(config: AgentConfig, state: AgenticState, findings: any[]): Promise<string> {
  // Fetch whitelisted IOCs
  const whitelistedIOCs = await getActiveWhitelistedIOCs();
  const whitelistJSON = getWhitelistAsJSON(whitelistedIOCs);
  const whitelistSection = whitelistedIOCs.length > 0
    ? `\n\n=== WHITELISTED IOCs (KNOWN SAFE - MUST EXCLUDE) ===\n\n${whitelistJSON}\n\nCRITICAL INSTRUCTION: The above IOCs are verified safe entities that MUST be completely excluded from your security analysis:\n- DO NOT investigate these users, IPs, domains, files, or hashes\n- DO NOT include them in your findings, analysis, or reports  \n- DO NOT flag them as suspicious or mention them as threats\n- These entities have been pre-approved and filtered for your safety\n- If you see activity from these IOCs, treat it as normal/benign baseline activity\n\nThese IOCs have already been filtered from your Splunk results, but if you encounter them in correlation analysis or pattern matching, you MUST skip them.\n`
    : '';

  const splunkReference = `\n\n=== SPLUNK INDEXES & SOURCETYPES AVAILABLE ===\n\nIndexes:\n- cloudtrail: AWS API activity, security auditing\n- vpcflow: Network traffic analysis, flow logs\n- linux: Linux security, Sysmon, auth logs\n- windows: Windows events, security logs\n- cloudwatch: ECS logs, Lambda, Bedrock AI\n- aws-metadata: EC2 metadata, resource inventory\n- loadbalancer: ELB access logs, web traffic\n- waf: AWS WAF logs\n- amazonq: Amazon Q invocation logs\n\nKey Source Types:\n- aws:cloudtrail (cloudtrail index): IAM activity, API calls\n- aws:cloudwatchlogs:vpcflow (vpcflow index): Network traffic\n- aws:cloudwatchlogs:ecs (cloudwatch index): Container logs\n- sysmon:linux (linux index): Process creation, network connections\n- linux_auth (linux index): SSH logins, sudo commands\n- XmlWinEventLog (windows index): Windows security events\n\nIMPORTANT FIELD EXTRACTION NOTES:\n- Most sourcetypes have PRE-EXTRACTED FIELDS that are immediately available\n- Use the DISCOVERED INDEX STRUCTURE section below for exact field names per sourcetype\n\nExample Queries (ALWAYS include earliest= and latest=):\n- index=cloudtrail eventName=ConsoleLogin earliest=-24h latest=now | table _time, userIdentity.userName, sourceIPAddress\n- index=vpcflow action=REJECT earliest=-7d latest=now | stats count by srcaddr, dstport\n- index=linux sourcetype=sysmon:linux EventID=1 earliest=-1h latest=now | table _time, Image, CommandLine\n- index=windows EventCode=4625 earliest=-24h latest=now | stats count by Account_Name\n\nCRITICAL SPLUNK TIME FORMAT RULES:\n1. ALWAYS use earliest= and latest= in ALL queries\n2. Relative time (PREFERRED): earliest=-24h, earliest=-7d, earliest=-30m, latest=now\n3. Snap to time: earliest=-24h@h (snap to hour), earliest=-d@d (snap to day start)\n4. Absolute time format: earliest="11/01/2025:00:00:00" latest="11/30/2025:23:59:59"\n   - Format MUST be: MM/DD/YYYY:HH:MM:SS (American format with colons)\n5. Epoch time: earliest=1698796800 latest=1701388799\n6. NEVER use ISO 8601 format (2025-11-01T00:00:00) - THIS IS INVALID\n\nExamples:\n- Last 24 hours: earliest=-24h latest=now\n- Last 7 days: earliest=-7d latest=now\n- Yesterday: earliest=-d@d latest=@d\n- Specific dates: earliest="11/01/2025:00:00:00" latest="11/30/2025:23:59:59"\n- This month: earliest=-mon@mon latest=now\n`;

  // Fetch dynamic index structure from database
  let discoveredStructure = '';
  try {
    const splunkConfig = await prisma.splunkConfig.findFirst({
      where: { isActive: true },
      select: { indexStructure: true, structureFetchedAt: true },
    });

    if (splunkConfig?.indexStructure && splunkConfig.structureFetchedAt) {
      const structure = splunkConfig.indexStructure as Record<string, Record<string, { fields: string[] }>>;

      discoveredStructure = `\n\n=== DISCOVERED INDEX STRUCTURE (Fetched: ${new Date(splunkConfig.structureFetchedAt).toLocaleString()}) ===\n\n`;
      discoveredStructure += `This section contains actual indexes, sourcetypes, and EXTRACTED FIELDS from your Splunk instance.\n`;
      discoveredStructure += `IMPORTANT: These fields are PRE-EXTRACTED by Splunk and available for immediate use in queries.\n`;
      discoveredStructure += `DO NOT use rex or regex commands to extract these fields - they are already available!\n\n`;

      for (const [index, sourcetypes] of Object.entries(structure)) {
        discoveredStructure += `\nIndex: ${index}\n`;
        discoveredStructure += `${'='.repeat(50)}\n`;

        for (const [sourcetype, data] of Object.entries(sourcetypes)) {
          discoveredStructure += `\n  Sourcetype: ${sourcetype}\n`;
          discoveredStructure += `  ${'-'.repeat(48)}\n`;

          if (data.fields && data.fields.length > 0) {
            discoveredStructure += `  Extracted Fields (${data.fields.length}):\n`;
            discoveredStructure += `  ${data.fields.join(', ')}\n`;
          } else {
            discoveredStructure += `  Extracted Fields: None found\n`;
          }
        }
      }

      discoveredStructure += `\n${'='.repeat(50)}\n`;
      discoveredStructure += `CRITICAL: The fields listed above are ALREADY EXTRACTED. Use them directly in your queries.\n`;
      discoveredStructure += `Example: index=vpcflow srcaddr="10.0.0.1" (NOT: index=vpcflow | rex "..." )\n`;
    }
  } catch (error) {
    console.error('[Agentic Workflow] Error fetching index structure:', error);
    // Continue without dynamic structure
  }

  // --- NEW: EXTRACT LATEST ORCHESTRATOR COMMAND ---
  const lastOrchMsg = state.conversation_history.filter(m => m.role === 'orchestrator').pop();
  const orchestratorDirective = lastOrchMsg ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🚨 SUPERVISOR DIRECTIVE 🚨\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nThe Orchestrator has explicitly summoned you with the following assessment and instructions. You MUST follow these instructions:\n\n${lastOrchMsg.content}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` : '';
  // -----------------------------------------------

  // --- SHIELD CORRELATION AGENTS FROM SPLUNK RULES ---
  const isCorrelationAgent = config.name.includes('correlation');

  if (isCorrelationAgent) {
    return `
You are the autonomous ${config.name} agent.

ALERT:
${JSON.stringify(state.alert_data, null, 2)}${whitelistSection}${orchestratorDirective}

CONTEXT FROM OTHER AGENTS (THIS IS YOUR RAW MATERIAL):
${Object.entries(state.findings)
  .filter(([agent]) => agent !== config.name)
  .map(([agent, data]) => `${agent}: ${JSON.stringify(data)}`).join('\n\n')}

YOUR CAPABILITIES:
${config.capabilities.join(', ')}

INSTRUCTIONS:
Analyze the context provided by the specialist agents above.
Your specific output formatting instructions, tasks, and JSON schema are defined in your system prompt. 
You MUST output valid JSON exactly matching the complex schema requested in your system prompt. Ensure your JSON is perfectly formatted with all required commas and brackets.

CRITICAL WORKFLOW REQUIREMENT:
To successfully submit your findings to the system, you MUST inject these two exact fields into the root of your JSON response alongside your standard schema:
"action": "report",
"complete": true
`;
  }
  // ---------------------------------------------------------

  return `
You are an autonomous ${config.name} agent. Your job is to investigate this security alert thoroughly.

ALERT:
${JSON.stringify(state.alert_data, null, 2)}${whitelistSection}${splunkReference}${discoveredStructure}${orchestratorDirective}

CONTEXT FROM OTHER AGENTS:
${Object.entries(state.findings)
  .filter(([agent]) => agent !== config.name) // DO NOT FEED THE AGENT ITS OWN PAST MISTAKES!
  .map(([agent, data]) => `${agent}: ${JSON.stringify(data).substring(0, 300)}...`).join('\n')}

YOUR PREVIOUS FINDINGS:
${JSON.stringify(findings, null, 2)}

${findings.some(f => f.action === 'user_guidance') ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 URGENT USER STEERING GUIDANCE 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The user monitoring this investigation has provided CRITICAL guidance:

${findings.filter(f => f.action === 'user_guidance').map(f => f.guidance).join('\n\n')}

ACTION REQUIRED:
- Read and understand this guidance carefully
- Adjust your investigation path IMMEDIATELY based on this input
- If instructed to skip an IOC/entity, stop investigating it NOW
- If directed to focus on something specific, prioritize it in your next action
- Acknowledge this guidance in your reasoning
- The user is course-correcting because the current path may be wrong

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${findings.filter(f => f.action === 'query' && !f.skipped).length > 0 ? `
QUERIES YOU HAVE ALREADY EXECUTED:
${findings.filter(f => f.action === 'query' && !f.skipped).map((f, i) =>
    `${i + 1}. ${f.query?.substring(0, 150)}${f.query && f.query.length > 150 ? '...' : ''} (Iteration ${f.iteration}, ${f.results?.length || 0} results)`
  ).join('\n')}

⚠️ CRITICAL: DO NOT repeat these exact queries. If you need more data, try:
- Different time ranges (e.g., earlier or later periods)
- Different indexes or sourcetypes
- More specific filters or different field values
- Different search terms or aggregations
If your queries return no results, try a different approach or report your findings.
` : ''}
YOUR CAPABILITIES:
${config.capabilities.join(', ')}

INSTRUCTIONS:
You can autonomously investigate by:
1. Analyzing the data provided
2. Requesting Splunk queries (return action: "query" with SPL)
3. Drawing conclusions
4. Reporting findings when satisfied (return action: "report")
5. If you discover a distinct, new threat during your investigation that is OUTSIDE the scope of the original alert but warrants its own separate investigation, you can spawn a new alert.

IMPORTANT: You MUST take action on every iteration:
- If you need more data → return action: "query" with a NEW Splunk query (different from previous queries)
- If a query returns no results → try a different approach, time range, or index
- If multiple queries return no results → report findings explaining what you searched and why no evidence was found
- If multiple queries return no results → STOP querying and report findings based ONLY on your successful queries. 
- CRITICAL: NEVER claim "no evidence was found" if you successfully found malicious activity in earlier iterations. Only report "no evidence" if ALL of your queries returned 0 results.
- If you have sufficient findings → return action: "report" with your analysis
- DO NOT return action: "continue" - always either query for data or report findings
- DO NOT repeat the same query - it will return the same results and waste time

SPLUNK QUERY RULES:
- DO NOT include "search" at the beginning - it will be added automatically
- Start directly with your search criteria (e.g., "index=cloudtrail eventName=CreateAccessKey")
- For generating commands (metadata, rest, tstats, etc.), start with pipe: "| rest /services/data/indexes"
- Use proper SPL syntax with pipes for filtering: field=value | head 100 | table fields
- NEVER use "index" as a command - it's a field name, not a command: "index=cloudtrail" NOT "| index=*"
- Common patterns:
  * index=cloudtrail eventName="CreateAccessKey" | table _time, userIdentity.userName, sourceIPAddress
  * index=vpcflow action=REJECT | stats count by src_ip, dest_port
  * index=cloudwatch error OR exception | head 50
- Splunk returns _time in Unix Epoch format (e.g., 1763140502). Do not be alarmed if the raw results use Epoch time while your query uses human-readable time.
- AVOID THE 'IN()' OPERATOR: Do not use 'search field IN ("val1", "val2")' as LLMs frequently add spaces that break Splunk's exact-match parser. Instead, explicitly use OR statements: '(field="val1" OR field="val2")'.

OUTPUT FORMAT (JSON):
{
  "action": "query" | "report",
  "reasoning": "Your thought process and what you plan to do next",
  "query": "SPL query WITHOUT 'search' prefix (REQUIRED if action=query)",
  "finding": "What you discovered from previous queries",
  "analysis": "Full analysis (REQUIRED if action=report)",
  "notable_entities": [
    {
      "type": "User|Host|IPAddress|File|Process",
      "value": "The actual IP, username, filename, etc.",
      "significance": "Why this entity is important"
    }
  ],
  "notable_relationships": [
    {
      "source": {"type": "User", "value": "admin"},
      "target": {"type": "IPAddress", "value": "10.0.0.1"},
      "relationship": "AUTHENTICATED_FROM | EXECUTED_COMMAND | CONNECTED_TO",
      "significance": "What this connection means"
    }
  ],
  "new_alerts": [
    {
      "finding_type": "brute_force | impossible_travel | suspicious_process | data_exfiltration | privilege_escalation | malware | lateral_movement",
      "title_detail": {
        "primary_entity": "The ONE most relevant entity (user, host, or IP)",
        "key_detail": "One critical indicator (count, location, process, volume)"
      },
      "severity": "critical" | "high" | "medium" | "low",
      "description": "Why this needs a separate alert",
      "affected_entities": {"users": [], "hosts": [], "ips": [], "processes": []},
      "raw_data": {"relevant_ips": [], "notes": ""}
    }
  ],
  "confidence": 0.0-1.0,
  "complete": true if satisfied
}

ALERT TITLE COMPONENTS (for new_alerts):
When spawning new_alerts, provide structured title components:
- finding_type: The attack category
- title_detail.primary_entity: The ONE most relevant entity (user, host, or IP)
- title_detail.key_detail: One critical indicator (count, location, process, volume)

Examples:
- {"finding_type": "brute_force", "title_detail": {"primary_entity": "192.168.1.50", "key_detail": "47 failed logins to admin"}}
- {"finding_type": "suspicious_process", "title_detail": {"primary_entity": "DESKTOP-001", "key_detail": "Excel spawned PowerShell"}}
- {"finding_type": "impossible_travel", "title_detail": {"primary_entity": "jsmith", "key_detail": "NYC to Tokyo in 2 hours"}}

Be thorough. Query data as needed. Report when you have solid findings.
`;
}

/**
 * Parse JSON from LLM response, handling various formats
 */
function parseJSON(content: string): any {
  try {
    // Try direct parse
    return JSON.parse(content);
  } catch {
    // Extract from markdown code block
    const jsonMatch = content.match(/```json\s*\n([\s\S]+?)\n```/) || content.match(/```\s*\n(\{[\s\S]+?\})\n```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch { }
    }
    // Extract JSON object from text
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch { }
    }
    // Return as-is wrapped in object
    return { analysis: content, raw: content };
  }
}