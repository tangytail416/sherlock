'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, Send, Loader2, AlertTriangle, Brain, Search, Code, CheckCircle2, ChevronRight, ChevronDown, ChevronUp, FileText, FileSearch, ClipboardList, ChevronsUpDown, ArrowUp } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ConversationContainer,
  ConversationContent,
  ConversationScrollButton,
} from './conversation/conversation-container';
import {
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
  findings: any;
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
  reports: Array<{
    id: string;
    title: string;
    summary: string | null;
    createdAt: string;
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
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const lastAutoExpandedStatus = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Storage for live events
  const storageKey = `conversation-events-${id}`;
  const agentEventsKey = `agent-events-${id}`;

  // Group messages by agent execution (not just agent name)
  const groupMessagesByAgent = useCallback((messages: ConversationMessage[], inv: Investigation | null) => {
    const grouped: Array<{
      agentName: string | null;
      groupId: string;
      groupType?: 'agent' | 'findings' | 'reports';
      messages: ConversationMessage[];
      metadata?: any;
    }> = [];
    let currentGroup: {
      agentName: string | null;
      groupId: string;
      groupType?: 'agent' | 'findings' | 'reports';
      messages: ConversationMessage[];
      metadata?: any;
    } | null = null;
    let executionCounter = 0;
    let lastReportedAgent: string | null = null;

    messages.forEach((msg) => {
      const agentName = msg.agentName || (msg.type === 'orchestrator' ? 'orchestrator' : null);

      // Special handling for user and alert messages
      if (msg.type === 'user' || msg.type === 'alert') {
        grouped.push({ agentName: null, groupId: `standalone-${msg.id}`, groupType: 'agent', messages: [msg] });
        currentGroup = null;
        lastReportedAgent = null;
        return;
      }

      // Start new group if:
      // 1. No current group exists
      // 2. Agent name changes
      // 3. We hit a system message (new iteration start) for a different agent
      // 4. Previous group ended with a report and this is a new system message (new execution)
      const shouldStartNewGroup = !currentGroup ||
                                   currentGroup.agentName !== agentName ||
                                   (msg.type === 'system' && lastReportedAgent === agentName);

      if (shouldStartNewGroup) {
        executionCounter++;
        const groupId = `${agentName}-exec-${executionCounter}`;
        currentGroup = { agentName, groupId, groupType: 'agent', messages: [msg] };
        grouped.push(currentGroup);

        // Reset last reported agent when starting new group
        if (msg.type !== 'agent-report') {
          lastReportedAgent = null;
        }
      } else if (currentGroup) {
        currentGroup.messages.push(msg);
      }

      // Track when we've seen a report for this agent
      if (msg.type === 'agent-report') {
        lastReportedAgent = agentName;
      }
    });

    // Add findings as a special group if available
    if (inv?.findings) {
      grouped.push({
        agentName: null,
        groupId: 'findings-group',
        groupType: 'findings',
        messages: [],
        metadata: { findings: inv.findings }
      });
    }

    // Add reports as a special group if available
    if (inv?.reports && inv.reports.length > 0) {
      grouped.push({
        agentName: null,
        groupId: 'reports-group',
        groupType: 'reports',
        messages: [],
        metadata: { reports: inv.reports }
      });
    }

    return grouped;
  }, []);

  // Load messages from localStorage on mount
  useEffect(() => {
    try {
      let stored = localStorage.getItem(storageKey);

      if (!stored) {
        const agentEventsStored = localStorage.getItem(agentEventsKey);
        if (agentEventsStored) {
          const agentEvents = JSON.parse(agentEventsStored);
          const conversationMessages = buildMessagesFromAgentEvents(agentEvents);
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
      }
      setHasLoadedFromStorage(true);
    } catch (error) {
      console.error('[Conversation] Failed to load messages:', error);
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

        if (messages.length === 0) {
          buildConversationFromExecutions(data.agentExecutions);
        }
      } catch (error) {
        console.error('Error fetching investigation:', error);
      }
    }

    if (hasLoadedFromStorage) {
      fetchInvestigation();
      const interval = setInterval(() => {
        fetch(`/api/investigations/${id}`)
          .then(res => res.json())
          .then(data => setInvestigation(data))
          .catch(err => console.error('Error polling:', err));
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [id, hasLoadedFromStorage]);

  // Auto-expand agents based on investigation status (only when status changes)
  useEffect(() => {
    if (!investigation || messages.length === 0) return;

    // Only auto-expand when status changes, not on every message update
    if (lastAutoExpandedStatus.current === investigation.status) return;
    lastAutoExpandedStatus.current = investigation.status;

    const grouped = groupMessagesByAgent(messages, investigation);
    const agentGroups = grouped
      .filter(g => g.groupType === 'agent' && g.agentName && g.agentName !== 'orchestrator'); // Orchestrator always collapsed

    if (investigation.status === 'completed') {
      // Expand all agents and findings/reports for completed investigations
      const allGroupIds = grouped
        .filter(g => g.groupType !== 'agent' || (g.agentName && g.agentName !== 'orchestrator'))
        .map(g => g.groupId);
      setExpandedAgents(new Set(allGroupIds));
    } else if (investigation.status === 'active') {
      // Only expand the last (active) agent for live investigations
      if (agentGroups.length > 0) {
        const lastGroup = agentGroups[agentGroups.length - 1];
        setExpandedAgents(new Set([lastGroup.groupId]));
      }
    }
  }, [investigation?.status, messages.length, groupMessagesByAgent, investigation]);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (error) {
        console.error('[Conversation] Failed to save messages:', error);
      }
    }
  }, [messages, storageKey]);

  // Build from agent events
  const buildMessagesFromAgentEvents = (agentEvents: any[]): ConversationMessage[] => {
    const conversationMessages: ConversationMessage[] = [];

    agentEvents.forEach((event, index) => {
      if (event.phase === 'input') {
        conversationMessages.push({
          id: `${event.agentName}-input-${index}`,
          type: 'system',
          agentName: event.agentName,
          content: `Iteration ${event.data.iteration}`,
          timestamp: new Date(event.timestamp),
          metadata: { iteration: event.data.iteration },
        });
      } else if (event.phase === 'thinking') {
        const messageType = event.agentName === 'orchestrator' ? 'orchestrator' : 'agent-thinking';
        conversationMessages.push({
          id: `${event.agentName}-thinking-${index}`,
          type: messageType,
          agentName: event.agentName,
          content: event.data.reasoning || event.data.assessment || 'Thinking...',
          timestamp: new Date(event.timestamp),
          metadata: {
            action: event.data.action,
            nextSteps: event.data.next_steps,
          },
        });
      } else if (event.phase === 'query') {
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

  // Build from executions
  const buildConversationFromExecutions = (executions: any[]) => {
    const conversationMessages: ConversationMessage[] = [];

    executions
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((exec) => {
        if (exec.agentName === 'orchestrator' && exec.result) {
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
              },
            });
          }
        } else if (exec.status === 'completed' && exec.result) {
          const result = exec.result;
          const findings = result.findings || [];

          findings.forEach((finding: any, idx: number) => {
            const iterationNum = idx + 1;

            conversationMessages.push({
              id: `${exec.id}-iteration-${iterationNum}`,
              type: 'system',
              agentName: exec.agentName,
              content: `Iteration ${iterationNum}`,
              timestamp: new Date(exec.createdAt),
              metadata: { iteration: iterationNum },
            });

            if (finding.reasoning) {
              conversationMessages.push({
                id: `${exec.id}-thinking-${iterationNum}`,
                type: 'agent-thinking',
                agentName: exec.agentName,
                content: finding.reasoning,
                timestamp: new Date(exec.createdAt),
                metadata: { action: finding.action || 'query' },
              });
            }

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
          });

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
                analysis: result.summary,
                confidence: exec.confidence,
              },
            });
          }
        }
      });

    setMessages(conversationMessages);
  };

  // Socket.IO
  useEffect(() => {
    const socketInstance = io({ path: '/socket.io' });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      socketInstance.emit('join-investigation', id);
    });

    socketInstance.on('disconnect', () => setIsConnected(false));

    socketInstance.on('agent-event', (event: AgentEvent) => {
      if (event.phase === 'input') {
        setMessages((prev) => [...prev, {
          id: `${event.agentName}-input-${Date.now()}`,
          type: 'system',
          agentName: event.agentName,
          content: `Iteration ${event.data.iteration}`,
          timestamp: new Date(event.timestamp),
          metadata: { iteration: event.data.iteration },
        }]);
      } else if (event.phase === 'thinking') {
        const messageType = event.agentName === 'orchestrator' ? 'orchestrator' : 'agent-thinking';
        setMessages((prev) => [...prev, {
          id: `${event.agentName}-thinking-${Date.now()}`,
          type: messageType,
          agentName: event.agentName,
          content: event.data.reasoning || event.data.assessment || 'Thinking...',
          timestamp: new Date(event.timestamp),
          metadata: {
            action: event.data.action,
            nextSteps: event.data.next_steps,
          },
        }]);
      } else if (event.phase === 'query') {
        setMessages((prev) => [...prev, {
          id: `${event.agentName}-tool-${Date.now()}`,
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
        }]);
      } else if (event.phase === 'query-results') {
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
        const content =
          typeof event.data.analysis === 'string'
            ? event.data.analysis
            : JSON.stringify(event.data.analysis);

        setMessages((prev) => [...prev, {
          id: `${event.agentName}-output-${Date.now()}`,
          type: 'agent-report',
          agentName: event.agentName,
          content,
          timestamp: new Date(event.timestamp),
          metadata: {
            analysis: event.data.analysis,
            confidence: event.data.confidence,
          },
        }]);
      } else if (event.phase === 'agent_acknowledged_message') {
        setMessages((prev) =>
          prev.map((m) =>
            m.type === 'user' && m.id === event.data.messageId
              ? { ...m, acknowledged: true, acknowledgedBy: event.data.acknowledgedBy }
              : m
          )
        );
      }
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.emit('leave-investigation', id);
        socketInstance.disconnect();
      }
    };
  }, [id]);

  // Track scroll position to show/hide back to top button
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLDivElement;
      if (target.scrollTop > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    // Find the scroll container (it's created by StickToBottom)
    const scrollContainer = document.querySelector('[role="log"]') as HTMLDivElement;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      scrollContainerRef.current = scrollContainer;
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Scroll to top function
  const scrollToTop = () => {
    const scrollContainer = document.querySelector('[role="log"]') as HTMLDivElement;
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Send user message
  const handleSendMessage = async () => {
    if (!userInput.trim() || !investigation) return;

    setSending(true);
    const messageId = `user-${Date.now()}`;

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

  // Toggle expansion
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

  // Toggle agent expansion
  const toggleAgent = (groupId: string) => {
    setExpandedAgents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Toggle all groups (expand or collapse all)
  const toggleAllGroups = () => {
    const grouped = groupMessagesByAgent(messages, investigation);
    const allGroupIds = grouped.map(g => g.groupId);

    // If all or most groups are expanded, collapse all. Otherwise, expand all.
    const expandedCount = allGroupIds.filter(id => expandedAgents.has(id)).length;
    const shouldExpandAll = expandedCount < allGroupIds.length / 2;

    if (shouldExpandAll) {
      setExpandedAgents(new Set(allGroupIds));
    } else {
      setExpandedAgents(new Set());
    }
  };

  // Render grouped agent section
  const renderAgentGroup = (
    group: {
      agentName: string | null;
      groupId: string;
      groupType?: 'agent' | 'findings' | 'reports';
      messages: ConversationMessage[];
      metadata?: any;
    }
  ) => {
    const { agentName, groupId, groupType, messages: groupMessages, metadata } = group;

    if (!agentName && groupType === 'agent') {
      // Standalone message (user or alert)
      return groupMessages.map(msg => renderStandaloneMessage(msg));
    }

    // Handle Findings Group
    if (groupType === 'findings' && metadata?.findings) {
      const isExpanded = expandedAgents.has(groupId);
      return (
        <Collapsible
          key={groupId}
          open={isExpanded}
          onOpenChange={() => toggleAgent(groupId)}
          className="mb-4"
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-accent/50 p-2 rounded -ml-2">
            <div className="h-8 w-8 rounded-full flex items-center justify-center bg-green-500/10">
              <FileSearch className="h-4 w-4 text-green-500" />
            </div>
            <span className="font-semibold text-sm flex-1 text-left">Findings</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs bg-green-500/10">Investigation Results</Badge>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-10 mt-2 border-l-2 border-border/50 pl-4">
              <pre className="p-3 bg-muted rounded-lg overflow-auto text-xs max-h-96 whitespace-pre-wrap">
                {JSON.stringify(metadata.findings, null, 2)}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    }

    // Handle Reports Group
    if (groupType === 'reports' && metadata?.reports) {
      const isExpanded = expandedAgents.has(groupId);
      return (
        <Collapsible
          key={groupId}
          open={isExpanded}
          onOpenChange={() => toggleAgent(groupId)}
          className="mb-4"
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-accent/50 p-2 rounded -ml-2">
            <div className="h-8 w-8 rounded-full flex items-center justify-center bg-amber-500/10">
              <ClipboardList className="h-4 w-4 text-amber-500" />
            </div>
            <span className="font-semibold text-sm flex-1 text-left">Generated Reports</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs bg-amber-500/10">
                {metadata.reports.length} {metadata.reports.length === 1 ? 'report' : 'reports'}
              </Badge>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-10 mt-2 border-l-2 border-border/50 pl-4 space-y-3">
              {metadata.reports.map((report: any) => (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="block p-3 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{report.title}</h3>
                      {report.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {report.summary}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    }

    // Handle regular agent groups
    const isOrchestrator = agentName === 'orchestrator';
    const isExpanded = expandedAgents.has(groupId);

    // Filter out iteration markers (system messages)
    const visibleMessages = groupMessages.filter(msg => msg.type !== 'system');

    return (
      <Collapsible
        key={groupId}
        open={isExpanded}
        onOpenChange={() => toggleAgent(groupId)}
        className="mb-4"
      >
        {/* Agent Header */}
        <CollapsibleTrigger className="flex items-center gap-2 w-full hover:bg-accent/50 p-2 rounded -ml-2">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
            isOrchestrator ? 'bg-purple-500/10' : 'bg-blue-500/10'
          }`}>
            {isOrchestrator ? (
              <Brain className="h-4 w-4 text-purple-500" />
            ) : (
              <Search className="h-4 w-4 text-blue-500" />
            )}
          </div>
          <span className="font-semibold text-sm capitalize flex-1 text-left">
            {agentName?.replace(/-/g, ' ')}
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {visibleMessages.length} {visibleMessages.length === 1 ? 'action' : 'actions'}
            </Badge>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>

        {/* Agent Actions/Messages */}
        <CollapsibleContent>
          <div className="ml-10 mt-2 space-y-1 border-l-2 border-border/50 pl-4">
            {visibleMessages.map((msg) => renderCompactAction(msg))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  // Render compact action within agent group
  const renderCompactAction = (message: ConversationMessage) => {
    const isExpanded = expandedMessages.has(message.id);

    // Thinking
    if (message.type === 'agent-thinking' || message.type === 'orchestrator') {
      return (
        <div key={message.id} className="py-1.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-sm">
              <Brain className="h-3 w-3 text-muted-foreground" />
              <span>Thinking</span>
              {message.metadata?.action && (
                <Badge variant="outline" className="text-xs">{message.metadata.action}</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {format(message.timestamp, 'HH:mm:ss')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{message.content}</p>
          {message.metadata?.nextSteps && message.metadata.nextSteps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {message.metadata.nextSteps.map((step: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="text-xs">{step}</Badge>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Tool call
    if (message.type === 'agent-tool') {
      const hasResults = message.metadata?.results !== null;

      return (
        <div key={message.id} className="py-1.5">
          <div
            className="flex items-center justify-between cursor-pointer hover:bg-accent/30 -mx-2 px-2 py-1 rounded"
            onClick={() => toggleExpanded(message.id)}
          >
            <div className="flex items-center gap-2 text-sm">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Search className="h-3 w-3 text-green-500" />
              <span>Query Details</span>
              {hasResults && message.metadata?.resultCount !== undefined && (
                <span className="text-xs text-muted-foreground">({message.metadata.resultCount} results)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Tool: {message.metadata?.toolName}</Badge>
              <span className="text-xs text-muted-foreground">
                {format(message.timestamp, 'HH:mm:ss')}
              </span>
            </div>
          </div>

          {isExpanded && (
            <div className="mt-2 space-y-2 text-xs">
              <div>
                <div className="font-semibold text-muted-foreground mb-1">Input:</div>
                <pre className="bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {message.content}
                </pre>
                {message.metadata?.timeRange && (
                  <div className="text-muted-foreground mt-1">
                    Time: {message.metadata.timeRange.earliest} to {message.metadata.timeRange.latest}
                  </div>
                )}
              </div>

              {hasResults && (
                <div>
                  <div className="font-semibold text-muted-foreground mb-1">Output:</div>
                  {message.metadata?.warning ? (
                    <div className="text-orange-500 bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      {message.metadata.warning}
                    </div>
                  ) : message.metadata?.results.length > 0 ? (
                    <pre className="bg-muted p-2 rounded overflow-x-auto max-h-48 whitespace-pre-wrap">
                      {JSON.stringify(message.metadata.results, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-muted-foreground italic p-2">No results</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // Final report
    if (message.type === 'agent-report') {
      const reportData = message.metadata?.analysis;

      return (
        <div key={message.id} className="py-1.5">
          <div
            className="flex items-center justify-between cursor-pointer hover:bg-accent/30 -mx-2 px-2 py-1 rounded"
            onClick={() => toggleExpanded(message.id)}
          >
            <div className="flex items-center gap-2 text-sm">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              <span className="font-medium">Investigation Report</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-xs bg-green-600">Report</Badge>
              <span className="text-xs text-muted-foreground">
                {format(message.timestamp, 'HH:mm:ss')}
              </span>
            </div>
          </div>

          {isExpanded && reportData && typeof reportData === 'object' && (
            <div className="mt-3 space-y-3 text-xs">
              {(reportData.executive_summary || reportData.summary) && (
                <div>
                  <div className="font-semibold text-muted-foreground mb-1">Executive Summary</div>
                  <div className="bg-muted/50 p-2 rounded">
                    {reportData.executive_summary || reportData.summary}
                  </div>
                </div>
              )}

              {reportData.key_findings && (
                <div>
                  <div className="font-semibold text-muted-foreground mb-1">Key Findings</div>
                  <ul className="list-disc list-inside space-y-1 ml-2">
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

              {(reportData.timeline || reportData.attack_timeline) &&
                renderTimeline(reportData.timeline || reportData.attack_timeline)}

              {(reportData.mitre_attack || reportData.mitre || reportData.techniques) &&
                renderMitreAttack(reportData.mitre_attack || reportData.mitre || reportData.techniques)}

              {(reportData.iocs || reportData.indicators_of_compromise) &&
                renderIOCs(reportData.iocs || reportData.indicators_of_compromise)}

              {(reportData.recommendations || reportData.recommended_actions) &&
                renderRecommendations(reportData.recommendations || reportData.recommended_actions)}

              {reportData.technical_analysis && (
                <div>
                  <div className="font-semibold text-muted-foreground mb-1">Technical Analysis</div>
                  <div className="bg-muted/50 p-2 rounded">
                    {typeof reportData.technical_analysis === 'string'
                      ? reportData.technical_analysis
                      : JSON.stringify(reportData.technical_analysis, null, 2)}
                  </div>
                </div>
              )}

              {message.metadata?.confidence && (
                <div>
                  <div className="font-semibold text-muted-foreground mb-1">Confidence</div>
                  <div>
                    {typeof message.metadata.confidence === 'number'
                      ? `${(message.metadata.confidence * 100).toFixed(0)}%`
                      : message.metadata.confidence}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // Render standalone messages (user, alert)
  const renderStandaloneMessage = (message: ConversationMessage) => {
    if (message.type === 'alert') {
      return (
        <Card key={message.id} className="bg-muted/30 mb-4">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm mb-1">Alert Triggered</div>
                <div className="text-sm">{message.content}</div>
                <Badge variant="outline" className="mt-2">
                  {message.metadata?.severity}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (message.type === 'user') {
      return (
        <div key={message.id} className="flex gap-3 mb-6 justify-end">
          <div className="flex-1 max-w-[80%] space-y-2">
            <ReadIndicator
              acknowledged={message.acknowledged || false}
              acknowledgedBy={message.acknowledgedBy}
            />
            <div className="bg-primary text-primary-foreground rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
          <div className="flex-shrink-0 mt-1">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold">You</span>
            </div>
          </div>
        </div>
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

  const groupedMessages = groupMessagesByAgent(messages, investigation);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur shrink-0">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/investigations">
                <ArrowLeft className="h-4 w-4 mr-1 md:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">
                Investigation {investigation.id.slice(0, 8)}
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(investigation.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
            {renderStandaloneMessage({
              id: 'alert',
              type: 'alert',
              content: investigation.alert.title,
              timestamp: new Date(investigation.createdAt),
              metadata: { severity: investigation.alert.severity },
            })}

            {/* Expand/Collapse All Button */}
            {groupedMessages.length > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllGroups}
                  className="text-xs gap-1"
                >
                  <ChevronsUpDown className="h-3 w-3" />
                  {expandedAgents.size < groupedMessages.length / 2 ? 'Expand All' : 'Collapse All'}
                </Button>
              </div>
            )}

            {/* Grouped Messages */}
            {groupedMessages.map((group) => renderAgentGroup(group))}

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

        {/* Back to Top Button */}
        {showScrollTop && (
          <Button
            className="absolute top-4 right-4 rounded-full shadow-lg z-50"
            onClick={scrollToTop}
            size="icon"
            type="button"
            variant="outline"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </ConversationContainer>

      {/* Input Area */}
      <div className="border-t bg-background/95 backdrop-blur p-3 md:p-4 shrink-0">
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
              className="min-h-[50px] md:min-h-[60px] max-h-[120px] md:max-h-[200px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button type="submit" size="icon" disabled={sending || !userInput.trim()} className="shrink-0">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-1.5 md:mt-2 hidden sm:block">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
