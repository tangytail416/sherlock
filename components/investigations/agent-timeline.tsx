'use client';

import { formatDistanceToNow } from 'date-fns';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown, Brain, AlertTriangle, Code, Search, ChevronRight, FileText, Shield, MessageSquare } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { io } from 'socket.io-client';

type AgentExecution = {
  id: string;
  agentName: string;
  status: string;
  modelUsed: string | null;
  result: any;
  errorMessage: string | null;
  executionTime: number | null;
  confidence: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

interface AgentTimelineProps {
  executions: AgentExecution[];
  investigationId: string;
}

interface AgentEvent {
  investigationId: string;
  agentName: string;
  phase: 'input' | 'thinking' | 'query' | 'query-results' | 'output' | 'error' | 'user_message' | 'agent_acknowledged_message' | 'message_routed_to_orchestrator' | 'token_budget_warning';
  data: any;
  timestamp: string;
}

interface ProcessedEvent {
  id: string;
  agentName: string;
  iteration: number;
  type: 'system-prompt' | 'input' | 'thinking' | 'tool-use' | 'output' | 'error' | 'user-message' | 'acknowledgment' | 'routing' | 'warning';
  timestamp: string;
  data: any;
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-950',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-950',
  },
};

// Helper function to render timeline data as a table
function renderTimeline(timeline: any[]) {
  if (!timeline || timeline.length === 0) return null;

  return (
    <div className="overflow-x-auto max-w-full">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-2 font-semibold">Timestamp</th>
            <th className="text-left p-2 font-semibold">Event</th>
            <th className="text-left p-2 font-semibold">Significance</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map((item, idx) => (
            <tr key={idx} className="border-b border-border/50">
              <td className="p-2 align-top whitespace-nowrap">{item.timestamp || item.time || '-'}</td>
              <td className="p-2 align-top break-words">{item.event || item.description || '-'}</td>
              <td className="p-2 align-top break-words">{item.significance || item.impact || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Helper function to render MITRE ATT&CK data as a table
function renderMitreAttack(mitre: any) {
  if (!mitre) return null;

  // Handle different formats: array or object with techniques
  const techniques = Array.isArray(mitre) ? mitre : (mitre.techniques || Object.values(mitre));
  if (!techniques || techniques.length === 0) return null;

  return (
    <div className="overflow-x-auto max-w-full">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-2 font-semibold">Technique</th>
            <th className="text-left p-2 font-semibold">Tactic</th>
            <th className="text-left p-2 font-semibold">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {techniques.map((item: any, idx: number) => (
            <tr key={idx} className="border-b border-border/50">
              <td className="p-2 align-top break-words">
                {item.id || item.technique_id || '-'} {item.name || item.technique_name || ''}
              </td>
              <td className="p-2 align-top break-words">{item.tactic || '-'}</td>
              <td className="p-2 align-top break-words">{item.evidence || item.description || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Helper function to render IOCs grouped by type
function renderIOCs(iocs: any) {
  if (!iocs) return null;

  // Handle different formats
  const iocData = Array.isArray(iocs) ? { items: iocs } : iocs;

  return (
    <div className="space-y-2 max-w-full">
      {Object.entries(iocData).map(([type, values]: [string, any]) => {
        const items = Array.isArray(values) ? values : [values];
        if (items.length === 0) return null;

        return (
          <div key={type} className="max-w-full overflow-hidden">
            <div className="text-xs font-semibold text-muted-foreground capitalize mb-1">{type.replace(/_/g, ' ')}:</div>
            <ul className="list-disc list-inside text-xs space-y-1 ml-2">
              {items.map((item: any, idx: number) => (
                <li key={idx} className="break-words">
                  {typeof item === 'string' ? item : (item.value || JSON.stringify(item))}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// Helper function to render recommendations
function renderRecommendations(recommendations: any) {
  if (!recommendations) return null;

  // Handle different formats
  if (Array.isArray(recommendations)) {
    return (
      <ul className="list-disc list-inside text-xs space-y-1 ml-2">
        {recommendations.map((rec: any, idx: number) => (
          <li key={idx} className="break-words">
            {typeof rec === 'string' ? rec : rec.recommendation || rec.action || JSON.stringify(rec)}
          </li>
        ))}
      </ul>
    );
  }

  // Object format with categories
  return (
    <div className="space-y-3 max-w-full">
      {Object.entries(recommendations).map(([category, items]: [string, any]) => {
        const recs = Array.isArray(items) ? items : [items];
        return (
          <div key={category} className="max-w-full overflow-hidden">
            <div className="text-xs font-semibold capitalize mb-1">{category.replace(/_/g, ' ')}:</div>
            <ul className="list-disc list-inside text-xs space-y-1 ml-2">
              {recs.map((rec: any, idx: number) => (
                <li key={idx} className="break-words">
                  {typeof rec === 'string' ? rec : rec.recommendation || rec.action || JSON.stringify(rec)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function AgentTimeline({ executions, investigationId }: AgentTimelineProps) {
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([]);
  const [openCollapsibles, setOpenCollapsibles] = useState<Set<string>>(new Set());
  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);
  const accordionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const eventRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Storage key for localStorage
  const storageKey = `agent-events-${investigationId}`;

  // Load events from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsedEvents = JSON.parse(stored);
        setLiveEvents(parsedEvents);
      }
    } catch (error) {
      console.error('[Agent Timeline] Failed to load events from localStorage:', error);
    }
  }, [storageKey]);

  // Save events to localStorage whenever they change
  useEffect(() => {
    if (liveEvents.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(liveEvents));
      } catch (error) {
        console.error('[Agent Timeline] Failed to save events to localStorage:', error);
      }
    }
  }, [liveEvents, storageKey]);

  // Socket.IO connection
  useEffect(() => {
    // Connect to Socket.IO server
    const socketInstance = io({
      path: '/socket.io',
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Connected');
      socketInstance.emit('join-investigation', investigationId);
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected');
    });

    socketInstance.on('agent-event', (event: AgentEvent) => {
      console.log('[Socket.IO] Received event:', event);
      setLiveEvents((prev) => [...prev, event]);
    });

    return () => {
      if (socketInstance) {
        socketInstance.emit('leave-investigation', investigationId);
        socketInstance.disconnect();
      }
    };
  }, [investigationId]);

  const toggleCollapsible = (id: string) => {
    setOpenCollapsibles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const processLiveEvents = (): Map<string, ProcessedEvent[]> => {
    const agentMap = new Map<string, ProcessedEvent[]>();
    const systemPromptShown = new Set<string>();

    liveEvents.forEach((event, index) => {
      const agentKey = event.agentName;
      if (!agentMap.has(agentKey)) {
        agentMap.set(agentKey, []);
      }

      const iteration = event.data?.iteration || 1;

      // Process input event
      if (event.phase === 'input') {
        // Show system prompt only once per agent at the very beginning
        if (!systemPromptShown.has(agentKey)) {
          agentMap.get(agentKey)!.push({
            id: `${agentKey}-system-${index}`,
            agentName: agentKey,
            iteration: 0,
            type: 'system-prompt',
            timestamp: event.timestamp,
            data: {
              message: `Starting ${agentKey} agent investigation`,
            },
          });
          systemPromptShown.add(agentKey);
        }

        // Add the user input (without system prompt)
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-input-${index}`,
          agentName: agentKey,
          iteration,
          type: 'input',
          timestamp: event.timestamp,
          data: {
            iteration,
            message: `Iteration ${iteration}`,
          },
        });
      }

      // Process thinking event
      if (event.phase === 'thinking') {
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-thinking-${index}`,
          agentName: agentKey,
          iteration,
          type: 'thinking',
          timestamp: event.timestamp,
          data: {
            action: event.data.action,
            reasoning: event.data.reasoning,
            warning: event.data.warning,
            usagePercent: event.data.usagePercent,
          },
        });
      }

      // Process query and query-results as tool-use
      if (event.phase === 'query') {
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-tool-${index}`,
          agentName: agentKey,
          iteration,
          type: 'tool-use',
          timestamp: event.timestamp,
          data: {
            toolName: 'Splunk Query',
            input: event.data.query,
            timeRange: event.data.timeRange,
            results: null, // Will be filled by query-results
          },
        });
      }

      if (event.phase === 'query-results') {
        // Find the most recent tool-use for this iteration and update it
        const agentEvents = agentMap.get(agentKey)!;
        for (let i = agentEvents.length - 1; i >= 0; i--) {
          if (agentEvents[i].type === 'tool-use' && agentEvents[i].iteration === iteration) {
            agentEvents[i].data.results = event.data.results || [];
            agentEvents[i].data.resultCount = event.data.resultCount;
            agentEvents[i].data.tokenCount = event.data.tokenCount;
            agentEvents[i].data.warning = event.data.warning;
            break;
          }
        }
      }

      // Process output event
      if (event.phase === 'output') {
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-output-${index}`,
          agentName: agentKey,
          iteration,
          type: 'output',
          timestamp: event.timestamp,
          data: {
            analysis: event.data.analysis,
            confidence: event.data.confidence,
            complete: event.data.complete,
          },
        });
      }

      // Process error event
      if (event.phase === 'error') {
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-error-${index}`,
          agentName: agentKey,
          iteration,
          type: 'error',
          timestamp: event.timestamp,
          data: {
            error: event.data.error,
            query: event.data.query,
          },
        });
      }

      // Process user message event
      if (event.phase === 'user_message') {
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-user-message-${index}`,
          agentName: agentKey,
          iteration,
          type: 'user-message',
          timestamp: event.timestamp,
          data: {
            messageId: event.data.messageId,
            message: event.data.message,
            scope: event.data.scope,
          },
        });
      }

      // Process agent acknowledged message event
      if (event.phase === 'agent_acknowledged_message') {
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-ack-${index}`,
          agentName: agentKey,
          iteration,
          type: 'acknowledgment',
          timestamp: event.timestamp,
          data: {
            messageId: event.data.messageId,
            message: event.data.message,
            acknowledgedBy: event.data.acknowledgedBy,
          },
        });
      }

      // Process message routed to orchestrator event
      if (event.phase === 'message_routed_to_orchestrator') {
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-routing-${index}`,
          agentName: agentKey,
          iteration,
          type: 'routing',
          timestamp: event.timestamp,
          data: {
            messageId: event.data.messageId,
            originalMessage: event.data.originalMessage,
            reason: event.data.reason,
          },
        });
      }

      // Process token budget warning event
      if (event.phase === 'token_budget_warning') {
        agentMap.get(agentKey)!.push({
          id: `${agentKey}-warning-${index}`,
          agentName: agentKey,
          iteration,
          type: 'warning',
          timestamp: event.timestamp,
          data: {
            contextTokens: event.data.contextTokens,
            threshold: event.data.threshold,
            message: event.data.message,
            estimatedDelay: event.data.estimatedDelay,
          },
        });
      }
    });

    return agentMap;
  };

  const renderEvent = (event: ProcessedEvent) => {
    switch (event.type) {
      case 'system-prompt':
        return (
          <div key={event.id} className="mb-4 pb-4 border-b border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Brain className="h-4 w-4" />
              <span>{event.data.message}</span>
              <span className="text-xs">{format(new Date(event.timestamp), 'HH:mm:ss')}</span>
            </div>
          </div>
        );

      case 'input':
        return (
          <div 
            key={event.id} 
            className="mb-3 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            <div className="flex items-center gap-2 mb-1 max-w-full">
              <Code className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm font-medium flex-shrink-0">Input</span>
              <Badge variant="outline" className="text-xs flex-shrink-0">{event.data.message}</Badge>
              <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                {format(new Date(event.timestamp), 'HH:mm:ss')}
              </span>
            </div>
          </div>
        );

      case 'thinking':
        const isThinkingOpen = openCollapsibles.has(event.id);
        const isReportAction = event.data.action === 'report';

        // Parse reasoning to check if it's a report or stopped status
        let reportData = null;
        let isStopped = false;

        if (isReportAction && event.data.reasoning) {
          if (typeof event.data.reasoning === 'object') {
            reportData = event.data.reasoning;
            isStopped = reportData.status === 'stopped';
          } else {
            try {
              reportData = JSON.parse(event.data.reasoning);
              isStopped = reportData.status === 'stopped';
            } catch {
              reportData = { raw: event.data.reasoning };
            }
          }
        }

        return (
          <div 
            key={event.id} 
            className="mb-3 ml-6 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            {isReportAction ? (
              <Collapsible open={isThinkingOpen} onOpenChange={() => toggleCollapsible(event.id)}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-accent/50 rounded p-2 -ml-2 max-w-full">
                  {isThinkingOpen ? (
                    <ChevronDown className="h-4 w-4 text-purple-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-purple-500 flex-shrink-0" />
                  )}
                  <FileText className="h-4 w-4 text-purple-500 flex-shrink-0" />
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium">Action: report</div>
                    {isStopped && (
                      <div className="text-xs text-orange-500">Investigation interrupted</div>
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 ml-6 max-w-full overflow-hidden">
                  <div className="space-y-4 max-w-full">
                    {isStopped ? (
                      <div className="max-w-full overflow-hidden">
                        <div className="text-sm text-orange-500 bg-orange-50 dark:bg-orange-950/20 p-3 rounded flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">[Request interrupted by user]</div>
                            {reportData?.reason && (
                              <div className="text-xs mt-1">{reportData.reason}</div>
                            )}
                            {reportData?.partial_findings && reportData.partial_findings.length > 0 && (
                              <div className="mt-2">
                                <div className="text-xs font-semibold mb-1">Partial findings:</div>
                                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 break-words whitespace-pre-wrap">
                                  {JSON.stringify(reportData.partial_findings, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : reportData ? (
                      <>
                        {/* Executive Summary */}
                        {(reportData.executive_summary || reportData.summary) && (
                          <div className="max-w-full overflow-hidden">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <div className="text-xs font-semibold text-muted-foreground">Executive Summary</div>
                            </div>
                            <div className="text-xs bg-muted/50 p-3 rounded break-words whitespace-pre-wrap">
                              {reportData.executive_summary || reportData.summary}
                            </div>
                          </div>
                        )}

                        {/* Key Findings */}
                        {reportData.key_findings && (
                          <div className="max-w-full overflow-hidden">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                              <div className="text-xs font-semibold text-muted-foreground">Key Findings</div>
                            </div>
                            <ul className="list-disc list-inside text-xs space-y-1 ml-2">
                              {(Array.isArray(reportData.key_findings) ? reportData.key_findings : [reportData.key_findings]).map((finding: any, idx: number) => (
                                <li key={idx} className="break-words">
                                  {typeof finding === 'string' ? finding : finding.finding || JSON.stringify(finding)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Timeline */}
                        {(reportData.timeline || reportData.attack_timeline) && (
                          <div className="max-w-full overflow-hidden">
                            <div className="flex items-center gap-2 mb-2">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <div className="text-xs font-semibold text-muted-foreground">Attack Timeline</div>
                            </div>
                            {renderTimeline(reportData.timeline || reportData.attack_timeline)}
                          </div>
                        )}

                        {/* MITRE ATT&CK */}
                        {(reportData.mitre_attack || reportData.mitre || reportData.techniques) && (
                          <div className="max-w-full overflow-hidden">
                            <div className="flex items-center gap-2 mb-2">
                              <Shield className="h-3 w-3 text-muted-foreground" />
                              <div className="text-xs font-semibold text-muted-foreground">MITRE ATT&CK Techniques</div>
                            </div>
                            {renderMitreAttack(reportData.mitre_attack || reportData.mitre || reportData.techniques)}
                          </div>
                        )}

                        {/* IOCs */}
                        {(reportData.iocs || reportData.indicators_of_compromise) && (
                          <div className="max-w-full overflow-hidden">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                              <div className="text-xs font-semibold text-muted-foreground">Indicators of Compromise</div>
                            </div>
                            {renderIOCs(reportData.iocs || reportData.indicators_of_compromise)}
                          </div>
                        )}

                        {/* Technical Analysis */}
                        {reportData.technical_analysis && (
                          <div className="max-w-full overflow-hidden">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Technical Analysis</div>
                            <div className="text-xs bg-muted/50 p-3 rounded break-words whitespace-pre-wrap">
                              {typeof reportData.technical_analysis === 'string'
                                ? reportData.technical_analysis
                                : JSON.stringify(reportData.technical_analysis, null, 2)}
                            </div>
                          </div>
                        )}

                        {/* Recommendations */}
                        {(reportData.recommendations || reportData.recommended_actions) && (
                          <div className="max-w-full overflow-hidden">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Recommendations</div>
                            {renderRecommendations(reportData.recommendations || reportData.recommended_actions)}
                          </div>
                        )}

                        {/* Confidence Assessment */}
                        {reportData.confidence && (
                          <div className="max-w-full overflow-hidden">
                            <div className="text-xs font-semibold text-muted-foreground mb-1">Confidence</div>
                            <div className="text-xs">
                              {typeof reportData.confidence === 'number'
                                ? `${(reportData.confidence * 100).toFixed(0)}%`
                                : reportData.confidence}
                            </div>
                          </div>
                        )}

                        {/* Raw content fallback */}
                        {reportData.raw && (
                          <div className="max-w-full overflow-hidden">
                            <div className="text-xs font-semibold text-muted-foreground mb-1">Full Report</div>
                            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-64 break-words whitespace-pre-wrap">
                              {reportData.raw}
                            </pre>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="max-w-full overflow-hidden">
                        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-64 break-words whitespace-pre-wrap">
                          {typeof event.data.reasoning === 'string'
                            ? event.data.reasoning
                            : JSON.stringify(event.data.reasoning, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <div className="flex items-start gap-2 max-w-full">
                <Brain className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium mb-1">Thinking</div>
                  {event.data.action && (
                    <div className="text-sm break-words">
                      <span className="font-medium">Action:</span>{' '}
                      <span className="text-muted-foreground">{event.data.action}</span>
                    </div>
                  )}
                  {event.data.reasoning && (
                    <div className="text-sm text-muted-foreground mt-1 break-words overflow-wrap-anywhere">
                      {typeof event.data.reasoning === 'string'
                        ? event.data.reasoning
                        : JSON.stringify(event.data.reasoning)}
                    </div>
                  )}
                  {event.data.warning && (
                    <div className="text-sm text-orange-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Token usage: {event.data.usagePercent}%
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'tool-use':
        const isOpen = openCollapsibles.has(event.id);
        return (
          <div 
            key={event.id} 
            className="mb-3 ml-6 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            <Collapsible open={isOpen} onOpenChange={() => toggleCollapsible(event.id)}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-accent/50 rounded p-2 -ml-2 max-w-full">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-green-500 flex-shrink-0" />
                )}
                <Search className="h-4 w-4 text-green-500 flex-shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium break-words">Tool Use: {event.data.toolName}</div>
                  {event.data.resultCount !== undefined && (
                    <div className="text-xs text-muted-foreground break-words">
                      {event.data.resultCount} results
                      {event.data.tokenCount && ` (${event.data.tokenCount.toLocaleString()} tokens)`}
                    </div>
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 ml-6 max-w-full overflow-hidden">
                <div className="space-y-2 max-w-full">
                  <div className="max-w-full overflow-hidden">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Input:</div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 break-words whitespace-pre-wrap max-w-full">
                      {event.data.input}
                    </pre>
                    {event.data.timeRange && (
                      <div className="text-xs text-muted-foreground mt-1 break-words">
                        Time: {event.data.timeRange.earliest} to {event.data.timeRange.latest}
                      </div>
                    )}
                  </div>
                  {event.data.results !== null && (
                    <div className="max-w-full overflow-hidden">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Output:</div>
                      {event.data.warning ? (
                        <div className="text-xs text-orange-500 bg-orange-50 dark:bg-orange-950/20 p-2 rounded break-words">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          {event.data.warning}
                        </div>
                      ) : event.data.results.length > 0 ? (
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 break-words whitespace-pre-wrap max-w-full">
                          {JSON.stringify(event.data.results, null, 2)}
                        </pre>
                      ) : (
                        <div className="text-xs text-muted-foreground italic p-2">No results</div>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );

      case 'output':
        return (
          <div 
            key={event.id} 
            className="mb-3 ml-6 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            <div className="flex items-start gap-2 max-w-full">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-green-600 mb-1">Output</div>
                {event.data.confidence && (
                  <div className="text-sm text-muted-foreground">
                    Confidence: {(event.data.confidence * 100).toFixed(0)}%
                  </div>
                )}
                {event.data.analysis && (
                  <div className="text-sm mt-2">
                    <pre className="bg-muted p-3 rounded overflow-auto max-h-64 text-xs break-words whitespace-pre-wrap">
                      {typeof event.data.analysis === 'string'
                        ? event.data.analysis
                        : JSON.stringify(event.data.analysis, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'error':
        return (
          <div 
            key={event.id} 
            className="mb-3 ml-6 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            <div className="flex items-start gap-2 max-w-full">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-destructive mb-1">Error</div>
                <div className="text-sm text-muted-foreground break-words">{event.data.error}</div>
                {event.data.query && (
                  <pre className="text-xs bg-destructive/10 p-2 rounded overflow-auto mt-2 break-words whitespace-pre-wrap">
                    {event.data.query}
                  </pre>
                )}
              </div>
            </div>
          </div>
        );

      case 'user-message':
        const scopeBg = event.data.scope === 'active_agent'
          ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
          : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800';
        const scopeIcon = event.data.scope === 'active_agent' ? '🎯' : '🧭';
        const scopeLabel = event.data.scope === 'active_agent' ? 'Active Agent' : 'Strategy';
        
        return (
          <div 
            key={event.id} 
            className="mb-3 ml-6 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            <div className={`p-3 rounded-lg border ${scopeBg} max-w-full`}>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium">User Steering</span>
                <Badge variant="outline" className="text-xs">
                  {scopeIcon} {scopeLabel}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                  {format(new Date(event.timestamp), 'HH:mm:ss')}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{event.data.message}</p>
            </div>
          </div>
        );

      case 'acknowledgment':
        return (
          <div 
            key={event.id} 
            className="mb-3 ml-6 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>Acknowledged by {event.data.acknowledgedBy}</span>
              <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                {format(new Date(event.timestamp), 'HH:mm:ss')}
              </span>
            </div>
          </div>
        );

      case 'routing':
        return (
          <div 
            key={event.id} 
            className="mb-3 ml-6 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            <div className="flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium">Message Routed to Orchestrator</span>
                <p className="text-xs text-muted-foreground mt-1">{event.data.reason}</p>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {format(new Date(event.timestamp), 'HH:mm:ss')}
              </span>
            </div>
          </div>
        );

      case 'warning':
        return (
          <div 
            key={event.id} 
            className="mb-3 ml-6 max-w-full overflow-hidden"
            ref={(el) => {
              if (el) eventRefs.current.set(event.id, el);
            }}
          >
            <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-1">
                  Token Budget Warning
                </div>
                <p className="text-sm text-muted-foreground break-words">{event.data.message}</p>
                {event.data.estimatedDelay && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Estimated delay: {event.data.estimatedDelay}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {format(new Date(event.timestamp), 'HH:mm:ss')}
              </span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Process live events to group by agent
  const processedLiveAgents = processLiveEvents();

  // Combine completed executions with live agents
  // Create a map to track all agents (both completed and live)
  const allAgents = new Map<string, {
    execution?: AgentExecution;
    liveEvents?: ProcessedEvent[];
    isLive: boolean;
  }>();

  // Track which live events we've already matched
  const matchedLiveAgents = new Set<string>();

  // Group executions by agent name and find the most recent one for each
  const mostRecentExecutions = new Map<string, AgentExecution>();
  executions.forEach((execution) => {
    const existing = mostRecentExecutions.get(execution.agentName);
    if (!existing || new Date(execution.createdAt) > new Date(existing.createdAt)) {
      mostRecentExecutions.set(execution.agentName, execution);
    }
  });

  // Process executions and match with live events
  executions.forEach((execution) => {
    const key = `${execution.agentName}-${execution.id}`;
    const liveEventsForAgent = processedLiveAgents.get(execution.agentName);
    const isMostRecent = mostRecentExecutions.get(execution.agentName)?.id === execution.id;

    if (liveEventsForAgent && isMostRecent) {
      // We have live events for this agent and this is the most recent execution
      matchedLiveAgents.add(execution.agentName);

      // Only mark as live if the execution is still running
      const isLive = execution.status === 'running';

      allAgents.set(key, {
        execution,
        liveEvents: liveEventsForAgent,
        isLive,
      });
    } else {
      // No live events for this execution, or not the most recent
      allAgents.set(key, {
        execution,
        isLive: false,
      });
    }
  });

  // Add any live events that don't have a matching execution yet
  processedLiveAgents.forEach((events, agentName) => {
    if (!matchedLiveAgents.has(agentName)) {
      // This is a new live agent that doesn't have a DB record yet
      const key = `${agentName}-live`;
      allAgents.set(key, {
        liveEvents: events,
        isLive: true,
      });
    }
  });

  // Clear live events for completed agents
  useEffect(() => {
    const completedAgentNames = executions
      .filter(e => e.status === 'completed' || e.status === 'failed')
      .map(e => e.agentName);

    if (completedAgentNames.length > 0) {
      // Remove events for completed agents from the live events list
      const filteredEvents = liveEvents.filter(event =>
        !completedAgentNames.includes(event.agentName)
      );

      if (filteredEvents.length !== liveEvents.length) {
        console.log('[Agent Timeline] Clearing events for completed agents:', completedAgentNames);
        setLiveEvents(filteredEvents);
      }
    }
  }, [executions, liveEvents]);

  // Auto-expand only live (running) agents and scroll to them
  useEffect(() => {
    // Recompute live agents to ensure we have the latest data
    const liveAgentKeys: string[] = [];

    // Find running executions
    const runningExecutions = executions.filter(e => e.status === 'running');

    // Add keys for running executions
    runningExecutions.forEach(exec => {
      const key = `${exec.agentName}-${exec.id}`;
      liveAgentKeys.push(key);
    });

    // Add keys for live agents without DB records yet
    const processedLive = processLiveEvents();
    const matchedNames = new Set(runningExecutions.map(e => e.agentName));

    processedLive.forEach((events, agentName) => {
      if (!matchedNames.has(agentName)) {
        const key = `${agentName}-live`;
        liveAgentKeys.push(key);
      }
    });

    // Update expanded items
    setOpenAccordionItems(liveAgentKeys);

    // Auto-scroll to the very last event added after a delay to ensure accordion animation completes
    if (liveAgentKeys.length > 0) {
      setTimeout(() => {
        // Find the absolute latest event across all live agents
        let latestEventId: string | null = null;
        let latestTimestamp = 0;

        // Process all live events and find the most recent one
        processedLive.forEach((events, agentName) => {
          // Look at all events for this agent and find the most recent
          events.forEach(event => {
            const eventTime = new Date(event.timestamp).getTime();
            if (eventTime > latestTimestamp) {
              latestTimestamp = eventTime;
              latestEventId = event.id;
            }
          });
        });

        // If we found a latest event, scroll to it
        if (latestEventId) {
          const element = eventRefs.current.get(latestEventId);
          if (element) {
            console.log('[Agent Timeline] Auto-scrolling to latest event:', latestEventId);
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
              inline: 'nearest'
            });
            return;
          }
        }

        // Fallback: scroll to the agent header if we can't find the event element
        for (let i = liveAgentKeys.length - 1; i >= 0; i--) {
          const key = liveAgentKeys[i];
          const element = accordionRefs.current.get(key);
          if (element) {
            console.log('[Agent Timeline] Auto-scrolling to live agent (fallback):', key);
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
              inline: 'nearest'
            });
            break;
          }
        }
      }, 300);
    }
  }, [liveEvents.length, executions.length]);

  return (
    <div className="space-y-4">
      <Accordion type="multiple" value={openAccordionItems} onValueChange={setOpenAccordionItems} className="space-y-4">
        {Array.from(allAgents.entries()).map(([key, agent]) => {
          const execution = agent.execution;
          const liveEvents = agent.liveEvents;
          const isLive = agent.isLive;

          // Determine status and config
          let status = execution?.status || 'running';
          const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
          const Icon = config.icon;

          // Get agent name
          const agentName = execution?.agentName || liveEvents?.[0]?.agentName || 'Unknown Agent';

          return (
            <AccordionItem
              key={key}
              value={key}
              className="border rounded-lg px-4"
              ref={(el) => {
                if (el) accordionRefs.current.set(key, el);
              }}
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-4 flex-1">
                  <div className={`p-2 rounded-full ${config.bg}`}>
                    <Icon
                      className={`h-5 w-5 ${config.color} ${
                        status === 'running' ? 'animate-spin' : ''
                      }`}
                    />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium capitalize">
                        {agentName.replace(/-/g, ' ')}
                      </h3>
                      <Badge variant={status === 'completed' ? 'secondary' : 'default'}>
                        {status}
                      </Badge>
                      {isLive && (
                        <Badge variant="default" className="bg-blue-500">
                          ● Live
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {execution?.completedAt
                        ? formatDistanceToNow(new Date(execution.completedAt), {
                            addSuffix: true,
                          })
                        : execution?.startedAt
                        ? `Started ${formatDistanceToNow(new Date(execution.startedAt), {
                            addSuffix: true,
                          })}`
                        : liveEvents && liveEvents.length > 0
                        ? `Started ${formatDistanceToNow(new Date(liveEvents[0].timestamp), {
                            addSuffix: true,
                          })}`
                        : execution?.createdAt
                        ? `Created ${formatDistanceToNow(new Date(execution.createdAt), {
                            addSuffix: true,
                          })}`
                        : 'Just started'}
                    </p>
                  </div>
                  {execution?.executionTime && (
                    <div className="text-sm text-muted-foreground">
                      {(execution.executionTime / 1000).toFixed(2)}s
                    </div>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                {/* Live Events */}
                {liveEvents && liveEvents.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground mb-2">Live Activity</div>
                    {liveEvents.map((event) => renderEvent(event))}
                  </div>
                )}

                {/* Execution Details (for completed agents) */}
                {execution && !isLive && (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {execution.modelUsed && (
                        <div>
                          <span className="font-medium">Model:</span>
                          <span className="ml-2 text-muted-foreground">{execution.modelUsed}</span>
                        </div>
                      )}
                      {execution.confidence !== null && (
                        <div>
                          <span className="font-medium">Confidence:</span>
                          <div className="mt-1">
                            <Progress value={execution.confidence * 100} className="h-2" />
                            <span className="text-xs text-muted-foreground">
                              {(execution.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Error Message */}
                    {execution.errorMessage && (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-sm font-medium text-destructive">Error</p>
                        <p className="text-sm text-muted-foreground mt-1">{execution.errorMessage}</p>
                      </div>
                    )}

                    {/* Result */}
                    {execution.result && (
                      <div>
                        <p className="text-sm font-medium mb-2">Result</p>
                        <pre className="p-3 bg-muted rounded-lg overflow-auto text-xs max-h-96">
                          {JSON.stringify(execution.result, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Execution Timeline */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {execution.startedAt && (
                        <div>
                          Started: {new Date(execution.startedAt).toLocaleString()}
                        </div>
                      )}
                      {execution.completedAt && (
                        <div>
                          Completed: {new Date(execution.completedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
