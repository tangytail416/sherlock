import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executeThreatHuntWorkflow } from '@/lib/threat-hunting/workflow';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Fetch the existing threat hunt
    const hunt = await prisma.threatHunt.findUnique({
      where: { id },
    });

    if (!hunt) {
      return NextResponse.json(
        { error: 'Threat hunt not found' },
        { status: 404 }
      );
    }

    if (hunt.status === 'active') {
      return NextResponse.json(
        { error: 'Threat hunt is already running' },
        { status: 400 }
      );
    }

    // 2. Update status to active and reset cycles for a fresh restart
    await prisma.threatHunt.update({
      where: { id },
      data: {
        status: 'active',
        cyclesRun: 0, // Reset cycles so the UI reflects the restart immediately
      },
    });

    // 3. Trigger the workflow in the background (do not await it so the UI responds instantly)
    executeThreatHuntWorkflow(hunt.id, hunt.config as any).catch(async (error) => {
      console.error(`[Threat Hunt] Error in restarted workflow: ${error.message}`);
      
      // If it fails in the background, mark it as failed
      try {
        await prisma.threatHunt.update({
          where: { id: hunt.id },
          data: {
            status: 'failed',
            errorMessage: error.message,
            completedAt: new Date(),
          },
        });
      } catch (updateError) {
        console.error('Failed to update hunt status to failed:', updateError);
      }
    });

    return NextResponse.json({ success: true, message: 'Threat hunt restarted' });
  } catch (error: any) {
    console.error('Error restarting threat hunt:', error);
    return NextResponse.json(
      { error: 'Failed to restart threat hunt', details: error.message },
      { status: 500 }
    );
  }
}