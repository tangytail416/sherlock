import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  if (io) {
    return io;
  }

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join investigation room
    socket.on('join-investigation', (investigationId: string) => {
      socket.join(`investigation-${investigationId}`);
      console.log(`[Socket.IO] Client ${socket.id} joined investigation ${investigationId}`);
    });

    // Leave investigation room
    socket.on('leave-investigation', (investigationId: string) => {
      socket.leave(`investigation-${investigationId}`);
      console.log(`[Socket.IO] Client ${socket.id} left investigation ${investigationId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

// Event emitter for agent events
export interface AgentEvent {
  investigationId: string;
  agentName: string;
  phase: 'input' | 'thinking' | 'query' | 'query-results' | 'output' | 'error';
  data: any;
  timestamp: Date;
}

export function emitAgentEvent(event: AgentEvent): void {
  if (!io) {
    console.warn('[Socket.IO] Server not initialized, skipping event emission');
    return;
  }

  const room = `investigation-${event.investigationId}`;
  io.to(room).emit('agent-event', event);
  console.log(`[Socket.IO] Emitted ${event.phase} event for ${event.agentName} to room ${room}`);
}
