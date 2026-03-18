import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executeAgenticWorkflow } from '@/lib/agents/agentic-workflow';
import { getAIProviderFromDB } from '@/lib/ai';

// POST /api/investigations/[id]/resume - Resume a failed/incomplete investigation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get investigation with alert and agent executions
    const investigation = await prisma.investigation.findUnique({
      where: { id },
      include: {
        alert: true,
        agentExecutions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    // Check if investigation can be resumed
    if (investigation.status === 'active') {
      return NextResponse.json(
        { error: 'Investigation is already active' },
        { status: 400 }
      );
    }

    // Can resume from 'failed', 'stopped', or 'completed' status
    // Note: For completed investigations with existing report, resume may regenerate analysis

    // Reset investigation status to active (but keep existing findings)
    // Clear completedAt so the investigation can complete again properly
    await prisma.investigation.update({
      where: { id },
      data: {
        status: 'active',
        completedAt: null,
      },
    });

    // Get AI provider - use saved one, or fallback to DB default, then to glm
    let aiProvider = investigation.aiProvider;
    if (!aiProvider) {
      const dbProvider = await getAIProviderFromDB();
      aiProvider = dbProvider?.type || 'glm';
    }

    // Resume investigation in the background
    resumeInvestigation(
      id,
      investigation.alert,
      aiProvider,
      investigation.findings || {}
    ).catch((error) => {
      console.error('Error resuming investigation:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Investigation resume initiated',
      previousExecutions: investigation.agentExecutions.length,
    });
  } catch (error) {
    console.error('Error resuming investigation:', error);
    return NextResponse.json(
      { error: 'Failed to resume investigation' },
      { status: 500 }
    );
  }
}

/**
 * Resume investigation from where it stopped
 * Reconstructs state from database and continues workflow
 */
async function resumeInvestigation(
  investigationId: string,
  alert: any,
  aiProvider: string,
  existingFindings: any
) {
  try {
    console.log(`[Investigation] Resuming investigation ${investigationId}`);

    // Get all completed agent executions to rebuild state
    // Exclude executions that were superseded by restart
    const agentExecutions = await prisma.agentExecution.findMany({
      where: {
        investigationId,
        status: 'completed',
        errorMessage: {
          not: 'Superseded by restart',
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`[Investigation] Found ${agentExecutions.length} completed agent executions`);

    // Reconstruct state from completed executions
    const reconstructedFindings: Record<string, any> = {};
    const completedAgents: string[] = [];

    for (const execution of agentExecutions) {
      if (execution.result) {
        reconstructedFindings[execution.agentName] = execution.result;
        completedAgents.push(execution.agentName);
      }
    }

    // Merge with existing findings
    const mergedFindings = {
      ...reconstructedFindings,
      ...(existingFindings || {}),
    };

    console.log(`[Investigation] Reconstructed state with ${Object.keys(mergedFindings).length} agent findings`);
    console.log(`[Investigation] Completed agents: ${completedAgents.join(', ')}`);

    // Continue with the agentic workflow
    // The workflow will check existing findings and decide next steps
    await executeAgenticWorkflow(investigationId, alert, aiProvider);

    console.log(`[Investigation] Resume workflow completed for ${investigationId}`);
  } catch (error) {
    console.error('Error in resumeInvestigation:', error);

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
