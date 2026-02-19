import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/investigations/[id]/stop - Stop an active investigation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get investigation
    const investigation = await prisma.investigation.findUnique({
      where: { id },
      include: {
        agentExecutions: {
          where: { status: 'running' },
        },
      },
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    // Check if investigation can be stopped
    if (investigation.status !== 'active') {
      return NextResponse.json(
        { error: `Investigation is ${investigation.status}, cannot stop` },
        { status: 400 }
      );
    }

    // Mark investigation as stopped
    await prisma.investigation.update({
      where: { id },
      data: {
        status: 'stopped',
      },
    });

    // Mark any running agents as stopped
    if (investigation.agentExecutions.length > 0) {
      await prisma.agentExecution.updateMany({
        where: {
          investigationId: id,
          status: 'running',
        },
        data: {
          status: 'stopped',
          completedAt: new Date(),
          errorMessage: 'Investigation stopped by user',
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Investigation stopped successfully',
      stoppedAgents: investigation.agentExecutions.length,
    });
  } catch (error) {
    console.error('Error stopping investigation:', error);
    return NextResponse.json(
      { error: 'Failed to stop investigation' },
      { status: 500 }
    );
  }
}
