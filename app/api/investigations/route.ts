import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createInvestigationSchema } from '@/lib/validations/investigation';
import { loadAllAgentConfigs, shouldTriggerAgent } from '@/lib/agents/config-loader';
import { executeAgent } from '@/lib/agents/executor';
import { executeAgenticWorkflow } from '@/lib/agents/agentic-workflow';

// GET /api/investigations - List all investigations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (status) where.status = status;

    const [investigations, total] = await Promise.all([
      prisma.investigation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          alert: {
            select: {
              id: true,
              title: true,
              severity: true,
              source: true,
            },
          },
          agentExecutions: {
            select: {
              id: true,
              agentName: true,
              status: true,
            },
          },
        },
      }),
      prisma.investigation.count({ where }),
    ]);

    return NextResponse.json({
      investigations,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching investigations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch investigations' },
      { status: 500 }
    );
  }
}

// POST /api/investigations - Create a new investigation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createInvestigationSchema.parse(body);

    // Verify alert exists
    const alert = await prisma.alert.findUnique({
      where: { id: validatedData.alertId },
    });

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    // Check if ANY non-completed investigation already exists for this alert
    const existingInvestigation = await prisma.investigation.findFirst({
      where: {
        alertId: validatedData.alertId,
        status: {
          in: ['pending', 'active', 'running', 'stopped', 'failed']
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingInvestigation) {
      console.log(`Existing investigation request detected for alert ${validatedData.alertId}, returning existing investigation ${existingInvestigation.id}`);
      
      // === FIX: IF IT IS PENDING, STOPPED, OR FAILED, START IT NOW ===
      if (['pending', 'stopped', 'failed'].includes(existingInvestigation.status)) {
        console.log(`Investigation is currently ${existingInvestigation.status}. Kickstarting workflow...`);
        
        // Ensure alert is marked as investigating
        await prisma.alert.update({
          where: { id: validatedData.alertId },
          data: { status: 'investigating' },
        });

        // Trigger the workflow in the background
        triggerAgentExecution(existingInvestigation.id, alert, existingInvestigation.aiProvider || validatedData.aiProvider).catch((error) => {
          console.error('Error triggering agent execution:', error);
        });

        // Optimistically update the status for the frontend response
        existingInvestigation.status = 'active';
      }
      // ===============================================================

      return NextResponse.json(existingInvestigation, { status: 200 });
    }

    // Get default AI provider if not specified
    let aiProvider: string | undefined = validatedData.aiProvider;
    let modelUsed: string | undefined;
    
    if (!aiProvider) {
      const defaultProvider = await prisma.aIProvider.findFirst({
        where: { isActive: true, isDefault: true },
      });
      
      if (defaultProvider) {
        aiProvider = defaultProvider.type;
        modelUsed = defaultProvider.modelName;
        console.log(`Using default AI provider: ${aiProvider} (${modelUsed})`);
      } else {
        // Fallback to openrouter if no default provider configured
        console.warn('No default AI provider found in database');
        aiProvider = 'openrouter';
        modelUsed = 'z-ai/glm-4.6';
      }
    }

    // Create investigation
    const investigation = await prisma.investigation.create({
      data: {
        alertId: validatedData.alertId,
        status: 'pending',
        priority: validatedData.priority || alert.severity,
        aiProvider,
        modelUsed,
      },
      include: {
        alert: true,
      },
    });

    // Update alert status to investigating
    await prisma.alert.update({
      where: { id: validatedData.alertId },
      data: { status: 'investigating' },
    });

    // Automatically trigger agent execution in the background
    triggerAgentExecution(investigation.id, alert, aiProvider).catch((error) => {
      console.error('Error triggering agent execution:', error);
    });

    return NextResponse.json(investigation, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    console.error('Error creating investigation:', error);
    return NextResponse.json(
      { error: 'Failed to create investigation' },
      { status: 500 }
    );
  }
}

/**
 * Trigger agent execution for an investigation
 * This runs in the background without blocking the response
 */
async function triggerAgentExecution(investigationId: string, alert: any, aiProvider?: string) {
  try {
    // Update investigation status to active
    const investigation = await prisma.investigation.update({
      where: { id: investigationId },
      data: { status: 'active' },
    });

    const effectiveAiProvider = aiProvider || investigation.aiProvider || 'openrouter';

    console.log(`[Investigation] Starting agentic workflow for ${investigationId}`);

    // Use the new agentic workflow
    await executeAgenticWorkflow(investigationId, alert, effectiveAiProvider);

    console.log(`[Investigation] Agentic workflow completed for ${investigationId}`);
  } catch (error) {
    console.error('Error in triggerAgentExecution:', error);

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