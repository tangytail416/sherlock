import { NextRequest } from 'next/server';
import { initSocketIO } from '@/lib/socket/server';

// For Next.js 15+ with app router, we need to handle Socket.IO differently
// This is a placeholder - Socket.IO will be initialized via a custom server

export async function GET(request: NextRequest) {
  return new Response(
    JSON.stringify({
      message: 'Socket.IO server is running',
      upgrade: 'Use WebSocket protocol to connect',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
