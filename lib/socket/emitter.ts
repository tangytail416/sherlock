/**
 * Socket.IO Event Emitter for Agent Events
 * Emits real-time updates during agent execution
 */

export interface AgentEvent {
  investigationId: string;
  agentName: string;
  phase: 'input' | 'thinking' | 'query' | 'query-results' | 'output' | 'error' | 'user_message' | 'agent_acknowledged_message' | 'message_routed_to_orchestrator' | 'token_budget_warning';
  data: any;
  timestamp: Date;
}

export function emitAgentEvent(event: AgentEvent): void {
  try {
    // Access global io instance set by server.js
    const io = (global as any).io;
    
    if (!io) {
      console.warn('[Socket.IO] Server not initialized, skipping event emission');
      return;
    }

    const room = `investigation-${event.investigationId}`;
    io.to(room).emit('agent-event', {
      ...event,
      timestamp: event.timestamp.toISOString(),
    });
    
    console.log(`[Socket.IO] Emitted ${event.phase} event for ${event.agentName}`);
  } catch (error) {
    console.error('[Socket.IO] Error emitting event:', error);
  }
}
