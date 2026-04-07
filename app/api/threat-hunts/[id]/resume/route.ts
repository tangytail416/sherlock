import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { executeThreatHuntWorkflow } from '@/lib/threat-hunting/workflow';

const prisma = new PrismaClient();

/**
 * POST /api/threat-hunts/[id]/resume - Resume a paused threat hunt
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the threat hunt to check current status and config
    const threatHunt = await prisma.threatHunt.findUnique({
      where: { id },
    });

    if (!threatHunt) {
      return NextResponse.json(
        { error: 'Threat hunt not found' },
        { status: 404 }
      );
    }

    if (threatHunt.status !== 'paused') {
      return NextResponse.json(
        { error: 'Can only resume paused threat hunts' },
        { status: 400 }
      );
    }

    // Update status back to active
    await prisma.threatHunt.update({
      where: { id },
      data: {
        status: 'active',
      },
    });

    // Resume the workflow
    const config = threatHunt.config as any;
    executeThreatHuntWorkflow(id, config).catch((error) => {
      console.error(`[Threat Hunt] Error resuming workflow: ${error.message}`);
      prisma.threatHunt.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      message: 'Threat hunt resumed successfully',
      id,
      status: 'active',
    });
  } catch (error: any) {
    console.error('Error resuming threat hunt:', error);
    return NextResponse.json(
      { error: 'Failed to resume threat hunt', details: error.message },
      { status: 500 }
    );
  }
}
