import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executeAgenticWorkflow } from '@/lib/agents/agentic-workflow';

// POST /api/investigations/[id]/restart - Restart a failed investigation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get investigation with alert
    const investigation = await prisma.investigation.findUnique({
      where: { id },
      include: {
        alert: true,
      },
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    // Check if investigation can be restarted
    if (investigation.status === 'active') {
      return NextResponse.json(
        { error: 'Investigation is already active. Stop it first to restart.' },
        { status: 400 }
      );
    }

    // Can restart from 'completed', 'failed', or 'stopped' status

    // Archive old agent executions by marking them as superseded
    await prisma.agentExecution.updateMany({
      where: {
        investigationId: id,
      },
      data: {
        errorMessage: 'Superseded by restart',
      },
    });

    // Reset investigation status to active and clear findings
    await prisma.investigation.update({
      where: { id },
      data: {
        status: 'active',
        completedAt: null,
        findings: undefined,
      },
    });

    // Trigger agent execution in the background
    restartInvestigation(id, investigation.alert, investigation.aiProvider || 'openrouter').catch((error) => {
      console.error('Error restarting investigation:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Investigation restart initiated',
    });
  } catch (error) {
    console.error('Error restarting investigation:', error);
    return NextResponse.json(
      { error: 'Failed to restart investigation' },
      { status: 500 }
    );
  }
}

/**
 * Restart investigation by running the agentic workflow again
 */
async function restartInvestigation(investigationId: string, alert: any, aiProvider: string) {
  try {
    console.log(`Restarting investigation ${investigationId} with AI provider: ${aiProvider}`);

    // Use the agentic workflow which properly handles AI provider
    await executeAgenticWorkflow(investigationId, alert, aiProvider);

    console.log(`Investigation ${investigationId} restart workflow completed`);
  } catch (error) {
    console.error('Error in restartInvestigation:', error);

    // Mark investigation as failed
    try {
      await prisma.investigation.update({
        where: { id: investigationId },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error('Error updating investigation status:', updateError);
    }
  }
}
