import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executeAgenticWorkflow } from '@/lib/agents/agentic-workflow';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Fetch the finding to get its details
    const finding = await prisma.threatFinding.findUnique({
      where: { id },
      include: { threatHunt: true } // Include hunt config to get the AI provider
    });

    if (!finding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    if (finding.investigationId) {
      return NextResponse.json({ error: 'This finding is already being investigated' }, { status: 400 });
    }

    // Ensure the finding actually has an associated Alert before proceeding
    const existingAlertId = finding.alertId;
    if (!existingAlertId) {
      return NextResponse.json({ error: 'No Alert found for this finding.' }, { status: 400 });
    }

    // 2. Perform a transaction to update the Alert and create the Investigation simultaneously
    const result = await prisma.$transaction(async (tx) => {
      
      // Mark the existing alert as 'investigating'
      const alert = await tx.alert.update({
        where: { id: existingAlertId },
        data: { status: 'investigating' }
      });

      // Fetch hunt config for AI provider fallback
      const huntConfig = finding.threatHunt?.config as any;

      // Create the Investigation attached to the EXISTING Alert
      const investigation = await tx.investigation.create({
        data: {
          alertId: alert.id,
          status: 'active',
          priority: finding.severity === 'critical' ? 'critical' : finding.severity === 'high' ? 'high' : 'medium',
          aiProvider: huntConfig?.aiProvider || 'glm',
          modelUsed: huntConfig?.modelUsed || 'glm-4-plus',
        },
      });

      // Update the Finding to reflect it is now linked to the new investigation
      await tx.threatFinding.update({
        where: { id },
        data: {
          investigationId: investigation.id,
          status: 'investigating',
        },
      });

      return { alert, investigation };
    });

    // 3. Trigger the workflow to start running in the background
    executeAgenticWorkflow(
      result.investigation.id, 
      result.alert, 
      result.investigation.aiProvider || 'glm'
    ).catch((error) => {
      console.error('Error starting agentic workflow on escalated finding:', error);
    });

    return NextResponse.json({ 
      success: true, 
      investigationId: result.investigation.id 
    });

  } catch (error: any) {
    console.error('Error escalating finding to investigation:', error);
    return NextResponse.json(
      { error: 'Failed to escalate finding', details: error.message },
      { status: 500 }
    );
  }
}