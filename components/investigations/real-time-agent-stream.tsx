'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Database, CheckCircle2, AlertTriangle, Code, Search, ChevronDown, ChevronRight, FileText, Clock, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AgentEvent {
  investigationId: string;
  agentName: string;
  phase: 'input' | 'thinking' | 'query' | 'query-results' | 'output' | 'error';
  data: any;
  timestamp: string;
}

interface RealTimeAgentStreamProps {
  investigationId: string;
}

interface ProcessedEvent {
  id: string;
  agentName: string;
  iteration: number;
  type: 'system-prompt' | 'input' | 'thinking' | 'tool-use' | 'output' | 'error';
  timestamp: string;
  data: any;
}

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

export function RealTimeAgentStream({ investigationId }: RealTimeAgentStreamProps) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [openCollapsibles, setOpenCollapsibles] = useState<Set<string>>(new Set());

  // Storage key for localStorage
  const storageKey = `agent-events-${investigationId}`;

  // Load events from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsedEvents = JSON.parse(stored);
        setEvents(parsedEvents);
      }
    } catch (error) {
      console.error('[Agent Stream] Failed to load events from localStorage:', error);
    }
  }, [storageKey]);

  // Save events to localStorage whenever they change
  useEffect(() => {
    if (events.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(events));
      } catch (error) {
        console.error('[Agent Stream] Failed to save events to localStorage:', error);
      }
    }
  }, [events, storageKey]);

  useEffect(() => {
    // Connect to Socket.IO server
    const socketInstance = io({
      path: '/socket.io',
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Connected');
      setIsConnected(true);
      socketInstance.emit('join-investigation', investigationId);
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected');
      setIsConnected(false);
    });

    socketInstance.on('agent-event', (event: AgentEvent) => {
      console.log('[Socket.IO] Received event:', event);
      setEvents((prev) => [...prev, event]);
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.emit('leave-investigation', investigationId);
        socketInstance.disconnect();
      }
    };
  }, [investigationId]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [events]);

  const processEvents = (): Map<string, ProcessedEvent[]> => {
    const agentMap = new Map<string, ProcessedEvent[]>();
    const systemPromptShown = new Set<string>();

    events.forEach((event, index) => {
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
    });

    return agentMap;
  };

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
          <div key={event.id} className="mb-3 max-w-full overflow-hidden">
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
          <div key={event.id} className="mb-3 ml-6 max-w-full overflow-hidden">
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
          <div key={event.id} className="mb-3 ml-6 max-w-full overflow-hidden">
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
          <div key={event.id} className="mb-3 ml-6 max-w-full overflow-hidden">
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
          <div key={event.id} className="mb-3 ml-6 max-w-full overflow-hidden">
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

      default:
        return null;
    }
  };

  const processedAgents = processEvents();

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Live Agent Stream</span>
            <Badge variant={isConnected ? 'default' : 'secondary'}>
              {isConnected ? 'Connected' : 'Connecting...'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Waiting for agent activity...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Live Agent Stream</span>
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? '● Live' : 'Disconnected'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]" ref={scrollAreaRef}>
          <div className="space-y-6 pr-4 max-w-full">
            {Array.from(processedAgents.entries()).map(([agentName, agentEvents]) => (
              <div key={agentName} className="border rounded-lg p-4 max-w-full overflow-hidden">
                <div className="flex items-center justify-between mb-4 max-w-full">
                  <h3 className="font-semibold text-lg truncate flex-1 min-w-0">{agentName}</h3>
                  <Badge variant="secondary" className="flex-shrink-0 ml-2">
                    {agentEvents.filter((e) => e.type !== 'system-prompt').length} events
                  </Badge>
                </div>
                <div className="space-y-1 max-w-full overflow-hidden">
                  {agentEvents.map((event) => renderEvent(event))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
