'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, Send, Loader2, AlertTriangle, Brain, Search, Code, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ConversationContainer,
  ConversationContent,
  ConversationScrollButton,
} from './conversation/conversation-container';
import {
  MessageContainer,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  ReportSection,
  ReadIndicator,
  renderTimeline,
  renderMitreAttack,
  renderIOCs,
  renderRecommendations,
} from './conversation/message-types';

interface AgentEvent {
  investigationId: string;
  agentName: string;
  phase: 'input' | 'thinking' | 'query' | 'query-results' | 'output' | 'error' | 'agent_acknowledged_message';
  data: any;
  timestamp: string;
}

interface ConversationMessage {
  id: string;
  type: 'orchestrator' | 'agent-thinking' | 'agent-tool' | 'agent-report' | 'user' | 'system' | 'alert';
  agentName?: string;
  content: string;
  timestamp: Date;
  metadata?: any;
  acknowledged?: boolean;
  acknowledgedBy?: string | null;
}

interface Investigation {
  id: string;
  status: string;
  priority: string;
  createdAt: string;
  alert: {
    id: string;
    title: string;
    severity: string;
  };
  agentExecutions: Array<{
    id: string;
    agentName: string;
    status: string;
    createdAt: string;
    completedAt?: string | null;
    result: any;
  }>;
}

export function InvestigationConversationView({ id }: { id: string }) {
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [sending, setSending] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  // Storage for live events
  const storageKey = `conversation-events-${id}`;
  const agentEventsKey = `agent-events-${id}`; // Same key as agent-timeline

  // Load messages from localStorage on mount (FIRST)
  useEffect(() => {
    try {
      // First try conversation-specific storage
      let stored = localStorage.getItem(storageKey);
      console.log('[Conversation] Checking localStorage keys:', { storageKey, agentEventsKey });

      // If not found, try to build from agent-events (from /investigations/<id> page)
      if (!stored) {
        const agentEventsStored = localStorage.getItem(agentEventsKey);
        console.log('[Conversation] agent-events found:', !!agentEventsStored);
        if (agentEventsStored) {
          const agentEvents = JSON.parse(agentEventsStored);
          console.log('[Conversation] Building from', agentEvents.length, 'agent events');
          const conversationMessages = buildMessagesFromAgentEvents(agentEvents);
          console.log('[Conversation] Built', conversationMessages.length, 'conversation messages');
          setMessages(conversationMessages);
          setHasLoadedFromStorage(true);
          return;
        }
      }

      if (stored) {
        const parsedMessages = JSON.parse(stored);
        setMessages(parsedMessages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })));
        console.log('[Conversation] Loaded', parsedMessages.length, 'messages from localStorage');
      }
      setHasLoadedFromStorage(true);
    } catch (error) {
      console.error('[Conversation] Failed to load messages from localStorage:', error);
      setHasLoadedFromStorage(true);
    }
  }, [storageKey, agentEventsKey]);

  // Fetch investigation data
  useEffect(() => {
    async function fetchInvestigation() {
      try {
        const res = await fetch(`/api/investigations/${id}`);
        if (!res.ok) throw new Error('Failed to fetch investigation');
        const data = await res.json();
        setInvestigation(data);

        // Only build from executions if we don't have any messages yet
        // This preserves the detailed live events from localStorage
        if (messages.length === 0) {
          console.log('[Conversation] No messages yet, building from executions');
          buildConversationFromExecutions(data.agentExecutions);
        } else {
          console.log('[Conversation] Already have', messages.length, 'messages, skipping execution build');
        }
      } catch (error) {
        console.error('Error fetching investigation:', error);
      }
    }

    // Only fetch after we've checked localStorage
    if (hasLoadedFromStorage) {
      fetchInvestigation();

      // Poll for updates every 10 seconds (but don't rebuild from executions)
      const interval = setInterval(() => {
        // Just fetch investigation metadata, don't rebuild messages
        fetch(`/api/investigations/${id}`)
          .then(res => res.json())
          .then(data => setInvestigation(data))
          .catch(err => console.error('Error polling investigation:', err));
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [id, hasLoadedFromStorage]);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (error) {
        console.error('[Conversation] Failed to save messages to localStorage:', error);
      }
    }
  }, [messages, storageKey]);

  // Build conversation messages from raw agent events (from localStorage)
  const buildMessagesFromAgentEvents = (agentEvents: any[]): ConversationMessage[] => {
    const conversationMessages: ConversationMessage[] = [];

    agentEvents.forEach((event, index) => {
      if (event.phase === 'input') {
        // Iteration marker
        conversationMessages.push({
          id: `${event.agentName}-input-${index}`,
          type: 'system',
          agentName: event.agentName,
          content: `Iteration ${event.data.iteration}`,
          timestamp: new Date(event.timestamp),
          metadata: { iteration: event.data.iteration, agentName: event.agentName },
        });
      } else if (event.phase === 'thinking') {
        // Thinking or orchestrator reflection
        const messageType = event.agentName === 'orchestrator' ? 'orchestrator' : 'agent-thinking';

        conversationMessages.push({
          id: `${event.agentName}-thinking-${index}`,
          type: messageType,
          agentName: event.agentName,
          content: event.data.reasoning || event.data.assessment || 'Thinking...',
          timestamp: new Date(event.timestamp),
          metadata: {
            action: event.data.action,
            reasoning: event.data.reasoning,
            nextSteps: event.data.next_steps,
            complete: event.data.complete,
          },
        });
      } else if (event.phase === 'query') {
        // Tool call - will be updated by query-results
        conversationMessages.push({
          id: `${event.agentName}-tool-${index}`,
          type: 'agent-tool',
          agentName: event.agentName,
          content: event.data.query,
          timestamp: new Date(event.timestamp),
          metadata: {
            toolName: 'Splunk Query',
            input: event.data.query,
            timeRange: event.data.timeRange,
            results: null,
          },
        });
      } else if (event.phase === 'query-results') {
        // Update the most recent tool message for this agent
        for (let i = conversationMessages.length - 1; i >= 0; i--) {
          if (
            conversationMessages[i].type === 'agent-tool' &&
            conversationMessages[i].agentName === event.agentName &&
            conversationMessages[i].metadata?.results === null
          ) {
            conversationMessages[i].metadata = {
              ...conversationMessages[i].metadata,
              results: event.data.results || [],
              resultCount: event.data.resultCount,
              tokenCount: event.data.tokenCount,
              warning: event.data.warning,
            };
            break;
          }
        }
      } else if (event.phase === 'output') {
        // Agent final report
        const content =
          typeof event.data.analysis === 'string'
            ? event.data.analysis
            : JSON.stringify(event.data.analysis);

        conversationMessages.push({
          id: `${event.agentName}-output-${index}`,
          type: 'agent-report',
          agentName: event.agentName,
          content,
          timestamp: new Date(event.timestamp),
          metadata: {
            analysis: event.data.analysis,
            confidence: event.data.confidence,
          },
        });
      }
    });

    return conversationMessages;
  };

  // Build conversation messages from completed agent executions
  const buildConversationFromExecutions = (executions: any[]) => {
    const conversationMessages: ConversationMessage[] = [];

    console.log('[Conversation] Building from executions:', executions.length);

    executions
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((exec) => {
        if (exec.agentName === 'orchestrator' && exec.result) {
          // Orchestrator planning or reflection
          const result = exec.result;

          if (result.reasoning || result.assessment) {
            conversationMessages.push({
              id: `${exec.id}-orchestrator`,
              type: 'orchestrator',
              content: result.reasoning || result.assessment,
              timestamp: new Date(exec.createdAt),
              metadata: {
                nextSteps: result.next_steps || [],
                complete: result.complete,
                investigationFocus: result.investigation_focus,
              },
            });
          }
        } else if (exec.status === 'completed' && exec.result) {
          // Agent execution - extract all iterations from findings
          const result = exec.result;
          console.log(`[Conversation] Agent ${exec.agentName} result structure:`, {
            hasFindings: !!result.findings,
            findingsLength: result.findings?.length,
            hasSummary: !!result.summary,
            resultKeys: Object.keys(result),
          });

          const findings = result.findings || [];

          // Process each iteration/finding
          findings.forEach((finding: any, idx: number) => {
            const iterationNum = idx + 1;

            // Add iteration marker
            conversationMessages.push({
              id: `${exec.id}-iteration-${iterationNum}`,
              type: 'system',
              agentName: exec.agentName,
              content: `Iteration ${iterationNum}`,
              timestamp: new Date(exec.createdAt),
              metadata: { iteration: iterationNum, agentName: exec.agentName },
            });

            // Add thinking/reasoning if available
            if (finding.reasoning) {
              conversationMessages.push({
                id: `${exec.id}-thinking-${iterationNum}`,
                type: 'agent-thinking',
                agentName: exec.agentName,
                content: finding.reasoning,
                timestamp: new Date(exec.createdAt),
                metadata: {
                  action: finding.action || 'query',
                  reasoning: finding.reasoning,
                },
              });
            }

            // Add tool call (query) if available
            if (finding.query) {
              conversationMessages.push({
                id: `${exec.id}-tool-${iterationNum}`,
                type: 'agent-tool',
                agentName: exec.agentName,
                content: finding.query,
                timestamp: new Date(exec.createdAt),
                metadata: {
                  toolName: 'Splunk Query',
                  input: finding.query,
                  timeRange: finding.timeRange,
                  results: finding.results || [],
                  resultCount: finding.results?.length || 0,
                },
              });
            }

            // Add analysis if available (but not on the last iteration - that goes in the final report)
            if (finding.analysis && idx < findings.length - 1) {
              conversationMessages.push({
                id: `${exec.id}-analysis-${iterationNum}`,
                type: 'agent-thinking',
                agentName: exec.agentName,
                content: typeof finding.analysis === 'string' ? finding.analysis : JSON.stringify(finding.analysis),
                timestamp: new Date(exec.createdAt),
                metadata: {
                  action: 'analyze',
                },
              });
            }
          });

          // Add final report with summary
          if (result.summary) {
            conversationMessages.push({
              id: `${exec.id}-report`,
              type: 'agent-report',
              agentName: exec.agentName,
              content: typeof result.summary === 'string' ? result.summary :
                       result.summary.executive_summary || result.summary.summary || JSON.stringify(result.summary),
              timestamp: new Date(exec.completedAt || exec.createdAt),
              metadata: {
                iterations: result.iterations || findings.length,
                findings: result.findings,
                keyFindings: result.summary,
                analysis: result.summary,
                confidence: exec.confidence,
              },
            });
          }
        }
      });

    console.log('[Conversation] Built', conversationMessages.length, 'messages from', executions.length, 'executions');
    setMessages(conversationMessages);
  };

  // Socket.IO for real-time updates
  useEffect(() => {
    const socketInstance = io({
      path: '/socket.io',
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Connected');
      setIsConnected(true);
      socketInstance.emit('join-investigation', id);
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected');
      setIsConnected(false);
    });

    socketInstance.on('agent-event', (event: AgentEvent) => {
      console.log('[Socket.IO] Received event:', event);
      handleAgentEvent(event);
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.emit('leave-investigation', id);
        socketInstance.disconnect();
      }
    };
  }, [id]);

  // Handle incoming agent events
  const handleAgentEvent = (event: AgentEvent) => {
    if (event.phase === 'input') {
      // Agent starting new iteration - add iteration marker
      setMessages((prev) => [
        ...prev,
        {
          id: `${event.agentName}-input-${Date.now()}`,
          type: 'system',
          agentName: event.agentName,
          content: `Iteration ${event.data.iteration}`,
          timestamp: new Date(event.timestamp),
          metadata: { iteration: event.data.iteration, agentName: event.agentName },
        },
      ]);
    } else if (event.phase === 'thinking') {
      // Agent thinking/reasoning or orchestrator reflection
      const messageType = event.agentName === 'orchestrator' ? 'orchestrator' : 'agent-thinking';

      setMessages((prev) => [
        ...prev,
        {
          id: `${event.agentName}-thinking-${Date.now()}`,
          type: messageType,
          agentName: event.agentName,
          content: event.data.reasoning || event.data.assessment || 'Thinking...',
          timestamp: new Date(event.timestamp),
          metadata: {
            action: event.data.action,
            reasoning: event.data.reasoning,
            nextSteps: event.data.next_steps,
            complete: event.data.complete,
          },
        },
      ]);
    } else if (event.phase === 'query') {
      // Agent executing tool (Splunk query)
      const toolMessageId = `${event.agentName}-tool-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        {
          id: toolMessageId,
          type: 'agent-tool',
          agentName: event.agentName,
          content: event.data.query,
          timestamp: new Date(event.timestamp),
          metadata: {
            toolName: 'Splunk Query',
            input: event.data.query,
            timeRange: event.data.timeRange,
            results: null,
          },
        },
      ]);
    } else if (event.phase === 'query-results') {
      // Tool results received - update the most recent tool message
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (
            updated[i].type === 'agent-tool' &&
            updated[i].agentName === event.agentName &&
            updated[i].metadata?.results === null
          ) {
            updated[i].metadata = {
              ...updated[i].metadata,
              results: event.data.results || [],
              resultCount: event.data.resultCount,
              tokenCount: event.data.tokenCount,
              warning: event.data.warning,
            };
            break;
          }
        }
        return updated;
      });
    } else if (event.phase === 'output') {
      // Agent completed - add final report
      const content =
        typeof event.data.analysis === 'string'
          ? event.data.analysis
          : JSON.stringify(event.data.analysis);

      setMessages((prev) => [
        ...prev,
        {
          id: `${event.agentName}-output-${Date.now()}`,
          type: 'agent-report',
          agentName: event.agentName,
          content,
          timestamp: new Date(event.timestamp),
          metadata: {
            analysis: event.data.analysis,
            confidence: event.data.confidence,
          },
        },
      ]);
    } else if (event.phase === 'agent_acknowledged_message') {
      // Mark user message as acknowledged
      setMessages((prev) =>
        prev.map((m) =>
          m.type === 'user' && m.id === event.data.messageId
            ? {
                ...m,
                acknowledged: true,
                acknowledgedBy: event.data.acknowledgedBy,
              }
            : m
        )
      );
    }
  };

  // Send user message
  const handleSendMessage = async () => {
    if (!userInput.trim() || !investigation) return;

    setSending(true);
    const messageId = `user-${Date.now()}`;

    // Optimistically add user message to conversation
    const newMessage: ConversationMessage = {
      id: messageId,
      type: 'user',
      content: userInput,
      timestamp: new Date(),
      acknowledged: false,
    };

    setMessages((prev) => [...prev, newMessage]);
    setUserInput('');

    try {
      await fetch(`/api/investigations/${id}/steer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userInput,
          scope: investigation.status === 'active' ? 'active_agent' : 'investigation',
        }),
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  // Toggle message expansion
  const toggleExpanded = (messageId: string) => {
    setExpandedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  // Group messages by agent
  const groupMessagesByAgent = (messages: ConversationMessage[]) => {
    const grouped: Array<{ agentName: string | null; messages: ConversationMessage[] }> = [];
    let currentGroup: { agentName: string | null; messages: ConversationMessage[] } | null = null;

    messages.forEach((msg) => {
      const agentName = msg.agentName || (msg.type === 'orchestrator' ? 'orchestrator' : null);

      if (!currentGroup || currentGroup.agentName !== agentName) {
        // Start new group
        currentGroup = { agentName, messages: [msg] };
        grouped.push(currentGroup);
      } else {
        // Add to existing group
        currentGroup.messages.push(msg);
      }
    });

    return grouped;
  };

  // Render compact action line within an agent group
  const renderCompactAction = (message: ConversationMessage) => {
    const isExpanded = expandedMessages.has(message.id);

    // System message (iteration markers)
    if (message.type === 'system') {
      return (
        <div key={message.id} className="flex items-center justify-between py-2 border-b border-border/50">
          <div className="flex items-center gap-2 text-sm">
            <Code className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{message.content}</span>
            <Badge variant="outline" className="text-xs">Thinking</Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {format(message.timestamp, 'HH:mm:ss')}
          </span>
        </div>
      );
    }

    // Orchestrator reflection message
    if (message.type === 'orchestrator') {
      return (
        <MessageContainer key={message.id} role="orchestrator">
          <MessageAvatar variant="orchestrator" />
          <MessageContent variant="orchestrator">
            <MessageHeader
              name="Orchestrator"
              badges={[<Badge key="badge" variant="outline" className="text-xs">Reflection</Badge>]}
              timestamp={message.timestamp}
            />
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
            {message.metadata?.nextSteps && message.metadata.nextSteps.length > 0 && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <div className="text-xs font-semibold text-muted-foreground mb-2">Next Steps:</div>
                <div className="flex flex-wrap gap-2">
                  {message.metadata.nextSteps.map((step: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {step}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </MessageContent>
        </MessageContainer>
      );
    }

    // Agent thinking message
    if (message.type === 'agent-thinking') {
      return (
        <MessageContainer key={message.id} role="agent">
          <MessageAvatar variant="agent" icon={<Brain className="h-4 w-4" />} />
          <MessageContent variant="agent">
            <MessageHeader
              name={message.agentName}
              badges={[
                <Badge key="badge" variant="outline" className="text-xs">
                  Thinking
                </Badge>,
                message.metadata?.action && (
                  <Badge key="action" variant="secondary" className="text-xs">
                    {message.metadata.action}
                  </Badge>
                ),
              ].filter(Boolean)}
              timestamp={message.timestamp}
            />
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{message.content}</p>
            </div>
          </MessageContent>
        </MessageContainer>
      );
    }

    // Agent tool call (Splunk query)
    if (message.type === 'agent-tool') {
      const hasResults = message.metadata?.results !== null;

      return (
        <MessageContainer key={message.id} role="agent">
          <MessageAvatar variant="agent" icon={<Search className="h-4 w-4" />} />
          <MessageContent variant="agent">
            <MessageHeader
              name={message.agentName}
              badges={[
                <Badge key="badge" variant="outline" className="text-xs">
                  Tool: {message.metadata?.toolName}
                </Badge>,
                hasResults && message.metadata?.resultCount !== undefined && (
                  <Badge key="results" variant="secondary" className="text-xs">
                    {message.metadata.resultCount} results
                  </Badge>
                ),
              ].filter(Boolean)}
              timestamp={message.timestamp}
            />

            <ReportSection
              isExpanded={isExpanded}
              onToggle={() => toggleExpanded(message.id)}
              title="Query Details"
              icon={<Search className="h-4 w-4" />}
            >
              {/* Query Input */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Input:</div>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap">
                  {message.content}
                </pre>
                {message.metadata?.timeRange && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Time: {message.metadata.timeRange.earliest} to {message.metadata.timeRange.latest}
                  </div>
                )}
              </div>

              {/* Query Results */}
              {hasResults && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Output:</div>
                  {message.metadata?.warning ? (
                    <div className="text-xs text-orange-500 bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      {message.metadata.warning}
                    </div>
                  ) : message.metadata?.results.length > 0 ? (
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 whitespace-pre-wrap">
                      {JSON.stringify(message.metadata.results, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-xs text-muted-foreground italic p-2">No results</div>
                  )}
                </div>
              )}
            </ReportSection>
          </MessageContent>
        </MessageContainer>
      );
    }

    // Agent final report
    if (message.type === 'agent-report') {
      const hasDetails = message.metadata?.keyFindings || message.metadata?.analysis;
      const reportData = message.metadata?.keyFindings || message.metadata?.analysis;

      return (
        <MessageContainer key={message.id} role="agent">
          <MessageAvatar variant="agent" icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} />
          <MessageContent variant="agent">
            <MessageHeader
              name={message.agentName}
              badges={[
                <Badge key="badge" variant="default" className="text-xs bg-green-600">
                  Report
                </Badge>,
                message.metadata?.iterations && (
                  <Badge key="iterations" variant="secondary" className="text-xs">
                    {message.metadata.iterations} iterations
                  </Badge>
                ),
              ].filter(Boolean)}
              timestamp={message.timestamp}
            />

            {hasDetails && typeof reportData === 'object' ? (
              <ReportSection
                isExpanded={isExpanded}
                onToggle={() => toggleExpanded(message.id)}
                title="Investigation Report"
              >
                {/* Executive Summary */}
                {(reportData.executive_summary || reportData.summary) && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      Executive Summary
                    </div>
                    <div className="text-xs bg-muted/50 p-3 rounded">
                      {reportData.executive_summary || reportData.summary}
                    </div>
                  </div>
                )}

                {/* Key Findings */}
                {reportData.key_findings && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Key Findings</div>
                    <ul className="list-disc list-inside text-xs space-y-1 ml-2">
                      {(Array.isArray(reportData.key_findings)
                        ? reportData.key_findings
                        : [reportData.key_findings]
                      ).map((finding: any, idx: number) => (
                        <li key={idx}>
                          {typeof finding === 'string' ? finding : finding.finding || JSON.stringify(finding)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Timeline */}
                {(reportData.timeline || reportData.attack_timeline) &&
                  renderTimeline(reportData.timeline || reportData.attack_timeline)}

                {/* MITRE ATT&CK */}
                {(reportData.mitre_attack || reportData.mitre || reportData.techniques) &&
                  renderMitreAttack(reportData.mitre_attack || reportData.mitre || reportData.techniques)}

                {/* IOCs */}
                {(reportData.iocs || reportData.indicators_of_compromise) &&
                  renderIOCs(reportData.iocs || reportData.indicators_of_compromise)}

                {/* Recommendations */}
                {(reportData.recommendations || reportData.recommended_actions) &&
                  renderRecommendations(reportData.recommendations || reportData.recommended_actions)}

                {/* Technical Analysis */}
                {reportData.technical_analysis && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      Technical Analysis
                    </div>
                    <div className="text-xs bg-muted/50 p-3 rounded">
                      {typeof reportData.technical_analysis === 'string'
                        ? reportData.technical_analysis
                        : JSON.stringify(reportData.technical_analysis, null, 2)}
                    </div>
                  </div>
                )}

                {/* Confidence */}
                {message.metadata?.confidence && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Confidence</div>
                    <div className="text-xs">
                      {typeof message.metadata.confidence === 'number'
                        ? `${(message.metadata.confidence * 100).toFixed(0)}%`
                        : message.metadata.confidence}
                    </div>
                  </div>
                )}
              </ReportSection>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-sm">{message.content}</p>
              </div>
            )}
          </MessageContent>
        </MessageContainer>
      );
    }

    // User message
    if (message.type === 'user') {
      return (
        <MessageContainer key={message.id} role="user">
          <MessageContent variant="user">
            <ReadIndicator
              acknowledged={message.acknowledged || false}
              acknowledgedBy={message.acknowledgedBy}
            />
            <div className="bg-primary text-primary-foreground rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </MessageContent>
          <MessageAvatar variant="user" label="You" />
        </MessageContainer>
      );
    }

    return null;
  };

  if (!investigation) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/investigations">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">Investigation: {investigation.alert.title}</h1>
              <p className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(investigation.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={investigation.status === 'active' ? 'default' : 'secondary'}>
              {investigation.status}
            </Badge>
            <Badge variant={isConnected ? 'default' : 'secondary'}>
              {isConnected ? '● Live' : 'Offline'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ConversationContainer className="flex-1">
        <ConversationContent>
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Alert Context */}
            {renderMessage({
              id: 'alert',
              type: 'alert',
              content: investigation.alert.title,
              timestamp: new Date(investigation.createdAt),
              metadata: { severity: investigation.alert.severity },
            })}

            {/* Conversation Messages */}
            {messages.map((message) => renderMessage(message))}

            {/* Loading indicator */}
            {investigation.status === 'active' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Investigation in progress...</span>
              </div>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </ConversationContainer>

      {/* Input Area */}
      <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex gap-2"
          >
            <Textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={
                investigation.status === 'active'
                  ? 'Send a message to steer the investigation...'
                  : 'Investigation completed. Messages will be logged for review.'
              }
              className="min-h-[60px] max-h-[200px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button type="submit" size="icon" disabled={sending || !userInput.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
