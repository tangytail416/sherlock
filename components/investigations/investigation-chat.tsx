'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, X, CheckCircle2, Clock, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import { formatDistanceToNow } from 'date-fns';

interface UserMessage {
  id: string;
  message: string;
  timestamp: string;
  scope: 'active_agent' | 'investigation';
  acknowledged: boolean;
  acknowledgedBy: string | null;
  routedToOrchestrator: boolean;
}

interface InvestigationChatProps {
  investigationId: string;
  status: string;
  onClose?: () => void;
}

const MAX_CHAR_LIMIT = 1000;
const MESSAGES_PER_PAGE = 50;

export function InvestigationChat({ investigationId, status, onClose }: InvestigationChatProps) {
  const [message, setMessage] = useState('');
  const [scope, setScope] = useState<'active_agent' | 'investigation'>('active_agent');
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [displayCount, setDisplayCount] = useState(MESSAGES_PER_PAGE);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const isActive = status === 'active';
  const charCount = message.length;
  const charLimitColor = charCount > MAX_CHAR_LIMIT * 0.9 ? 'text-red-500' : 'text-muted-foreground';

  // Load messages from localStorage
  useEffect(() => {
    const storageKey = `investigation-${investigationId}-messages`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setMessages(parsed);
      } catch (error) {
        console.error('Failed to parse stored messages:', error);
      }
    }
  }, [investigationId]);

  // Save messages to localStorage
  useEffect(() => {
    const storageKey = `investigation-${investigationId}-messages`;
    localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, investigationId]);

  // Socket.IO connection for real-time updates
  useEffect(() => {
    const socket = io({
      path: '/api/socket',
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Chat] Socket connected');
      socket.emit('join-investigation', investigationId);
    });

    socket.on('agent-event', (event: any) => {
      // Handle user message events
      if (event.phase === 'user_message' && event.data.messageId) {
        const newMessage: UserMessage = {
          id: event.data.messageId,
          message: event.data.message,
          timestamp: event.data.timestamp,
          scope: event.data.scope,
          acknowledged: false,
          acknowledgedBy: null,
          routedToOrchestrator: false,
        };
        
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === newMessage.id)) return prev;
          return [...prev, newMessage];
        });
      }

      // Handle acknowledgment events
      if (event.phase === 'agent_acknowledged_message' && event.data.messageId) {
        setMessages(prev => prev.map(msg => 
          msg.id === event.data.messageId
            ? { ...msg, acknowledged: true, acknowledgedBy: event.data.acknowledgedBy }
            : msg
        ));
      }

      // Handle routing events
      if (event.phase === 'message_routed_to_orchestrator' && event.data.messageId) {
        setMessages(prev => prev.map(msg =>
          msg.id === event.data.messageId
            ? { ...msg, routedToOrchestrator: true, scope: 'investigation' }
            : msg
        ));

        toast.info('Message Routed: Your message was routed to orchestrator after active agent timeout');
      }

      // Handle token budget warnings
      if (event.phase === 'token_budget_warning' && event.data.message) {
        toast.warning(`⚠️ Token Budget Warning: ${event.data.message}`, {
          duration: 5000,
        });
      }
    });

    return () => {
      socket.emit('leave-investigation', investigationId);
      socket.disconnect();
    };
  }, [investigationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || !isActive || charCount > MAX_CHAR_LIMIT) return;

    setSending(true);
    try {
      const response = await fetch(`/api/investigations/${investigationId}/steer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), scope }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      const result = await response.json();
      
      toast.success(
        scope === 'active_agent' 
          ? 'Message sent: Your guidance will be applied at the next agent iteration'
          : 'Message sent: Your strategic guidance will be considered by the orchestrator'
      );

      setMessage('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const visibleMessages = messages.slice(-displayCount);
  const hasMoreMessages = messages.length > displayCount;

  const loadMoreMessages = () => {
    setDisplayCount(prev => prev + MESSAGES_PER_PAGE);
  };

  return (
    <Card className="flex flex-col h-full rounded-none border-0">
      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
          <h3 className="font-semibold text-sm md:text-base">Investigation Steering</h3>
          <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
            {isActive ? 'Active' : status}
          </Badge>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Scope Selector */}
      <div className="p-3 md:p-4 border-b bg-muted/50">
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)}>
          <div className="space-y-2 md:space-y-3">
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="active_agent" id="active_agent" disabled={!isActive} className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="active_agent" className="font-medium cursor-pointer text-sm">
                  Steer Active Agent
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Stop current agent from investigating wrong IOC/path immediately at next iteration
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="investigation" id="investigation" disabled={!isActive} className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="investigation" className="font-medium cursor-pointer text-sm">
                  Guide Investigation Strategy
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Influence which specialist agents run next and overall investigation direction
                </p>
              </div>
            </div>
          </div>
        </RadioGroup>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3 md:p-4">
        {hasMoreMessages && (
          <div className="text-center mb-3 md:mb-4">
            <Button variant="ghost" size="sm" onClick={loadMoreMessages} className="text-xs md:text-sm">
              Load more messages ({messages.length - displayCount} older)
            </Button>
          </div>
        )}

        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 md:p-8 text-muted-foreground">
            <Info className="h-10 w-10 md:h-12 md:w-12 mb-3 md:mb-4 opacity-50" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-2">Send guidance to steer the investigation</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleMessages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                <div className={`rounded-lg p-3 ${
                  msg.scope === 'active_agent' 
                    ? 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800'
                    : 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800'
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {msg.scope === 'active_agent' ? '🎯 Active Agent' : '🧭 Strategy'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                </div>

                {/* Acknowledgment Status */}
                {msg.acknowledged && msg.acknowledgedBy && (
                  <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 ml-2">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Acknowledged by {msg.acknowledgedBy}</span>
                  </div>
                )}

                {!msg.acknowledged && !msg.routedToOrchestrator && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                    <Clock className="h-3 w-3" />
                    <span>Waiting for acknowledgment...</span>
                  </div>
                )}

                {msg.routedToOrchestrator && (
                  <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 ml-2">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Routed to orchestrator (active agent timeout)</span>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 md:p-4 border-t space-y-2">
        <Textarea
          placeholder={
            isActive
              ? 'Type your guidance here... (Shift+Enter for new line)'
              : 'Investigation must be active to send messages'
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isActive || sending}
          className="min-h-[60px] md:min-h-[80px] resize-none text-sm"
          maxLength={MAX_CHAR_LIMIT}
        />
        <div className="flex items-center justify-between">
          <span className={`text-xs ${charLimitColor}`}>
            {charCount} / {MAX_CHAR_LIMIT}
          </span>
          <Button
            onClick={handleSend}
            disabled={!isActive || !message.trim() || sending || charCount > MAX_CHAR_LIMIT}
            size="sm"
            className="text-xs md:text-sm"
          >
            {sending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
