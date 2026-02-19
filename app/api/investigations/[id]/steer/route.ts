/**
 * API endpoint for user steering during active investigations
 * Allows users to inject messages to guide active agents or overall investigation strategy
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { emitAgentEvent } from '@/lib/socket/emitter';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: investigationId } = await params;
    const body = await request.json();
    const { message, scope } = body;

    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!scope || !['active_agent', 'investigation'].includes(scope)) {
      return NextResponse.json(
        { error: 'Scope must be either "active_agent" or "investigation"' },
        { status: 400 }
      );
    }

    // Check if investigation exists and is active
    const investigation = await prisma.investigation.findUnique({
      where: { id: investigationId },
      select: { status: true },
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    if (investigation.status !== 'active') {
      return NextResponse.json(
        { error: `Cannot steer investigation with status: ${investigation.status}. Only active investigations can be steered.` },
        { status: 400 }
      );
    }

    // Create user message object
    const userMessage = {
      id: randomUUID(),
      message: message.trim(),
      timestamp: new Date(),
      scope: scope as 'active_agent' | 'investigation',
      acknowledged: false,
      acknowledgedBy: null,
      routedToOrchestrator: false,
    };

    // Store message in global state (will be picked up by agent/orchestrator)
    // Note: In production, you might want to persist this to Redis or database
    // For now, we'll emit via Socket.IO and let the workflow pick it up
    const io = (global as any).io;
    const stateKey = `investigation:${investigationId}:state`;
    
    // Get or create state storage
    if (!global.hasOwnProperty('investigationStates')) {
      (global as any).investigationStates = {};
    }
    
    const states = (global as any).investigationStates;
    if (!states[investigationId]) {
      states[investigationId] = { user_messages: [] };
    }
    
    // Append message to state
    states[investigationId].user_messages.push(userMessage);

    console.log(`[API /steer] User message added to investigation ${investigationId}`);
    console.log(`  - Scope: ${scope}`);
    console.log(`  - Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);

    // Emit Socket.IO event for real-time UI update
    if (io) {
      const room = `investigation-${investigationId}`;
      io.to(room).emit('agent-event', {
        investigationId,
        agentName: 'user',
        phase: 'user_message',
        data: {
          messageId: userMessage.id,
          message: userMessage.message,
          scope: userMessage.scope,
          timestamp: userMessage.timestamp.toISOString(),
        },
        timestamp: userMessage.timestamp.toISOString(),
      });

      console.log(`[API /steer] Socket.IO event emitted to room: ${room}`);
    }

    return NextResponse.json({
      success: true,
      messageId: userMessage.id,
      message: 'Steering message sent successfully',
      scope: userMessage.scope,
    });
  } catch (error) {
    console.error('[API /steer] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
