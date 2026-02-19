import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executeAgent, executeAgentChain } from '@/lib/agents';

// POST /api/investigations/[id]/execute - Execute agents for an investigation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { agentNames, executeChain = false } = body;

    if (!agentNames || !Array.isArray(agentNames) || agentNames.length === 0) {
      return NextResponse.json(
        { error: 'agentNames array is required' },
        { status: 400 }
      );
    }

    // Get investigation with alert data
    const investigation = await prisma.investigation.findUnique({
      where: { id },
      include: {
        alert: true,
        agentExecutions: {
          where: { status: 'completed' },
        },
      },
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    // Update investigation status to active
    await prisma.investigation.update({
      where: { id },
      data: { status: 'active' },
    });

    // Build context from previous executions
    const previousResults: Record<string, any> = {};
    for (const execution of investigation.agentExecutions) {
      if (execution.result) {
        previousResults[execution.agentName] = execution.result;
      }
    }

    const context = {
      investigationId: investigation.id,
      alertData: investigation.alert,
      previousResults,
      aiProvider: investigation.aiProvider || 'glm',
    };

    // Execute agents
    let results: Map<string, any>;
    if (executeChain) {
      // Execute in sequence with context passing
      results = await executeAgentChain(agentNames, context);
    } else {
      // Execute in parallel
      results = new Map();
      await Promise.all(
        agentNames.map(async (agentName) => {
          const result = await executeAgent(agentName, context);
          results.set(agentName, result);
        })
      );
    }

    // Check if all agents succeeded
    const allSucceeded = Array.from(results.values()).every((r) => r.success);

    // Update investigation status
    await prisma.investigation.update({
      where: { id },
      data: {
        status: allSucceeded ? 'completed' : 'failed',
        completedAt: allSucceeded ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: allSucceeded,
      results: Object.fromEntries(results),
    });
  } catch (error) {
    console.error('Error executing agents:', error);
    return NextResponse.json(
      { error: 'Failed to execute agents' },
      { status: 500 }
    );
  }
}
