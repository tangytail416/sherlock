import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getThreatHuntStatus } from '@/lib/threat-hunting/workflow';

const prisma = new PrismaClient();

/**
 * GET /api/threat-hunts/[id] - Get threat hunt details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get comprehensive status from workflow
    const status = await getThreatHuntStatus(id);

    if (!status) {
      return NextResponse.json(
        { error: 'Threat hunt not found' },
        { status: 404 }
      );
    }

    // Get detailed hunt data
    const hunt = await prisma.threatHunt.findUnique({
      where: { id },
      include: {
        findings: {
          orderBy: { detectedAt: 'desc' }, // Ensure this matches your schema
          take: 100,
        },
      },
    });

    // We moved this logic from the frontend to the backend so the 
    // client component can just consume the API directly!
    if (hunt?.findings) {
      const investigationIds = hunt.findings
        .map(f => f.investigationId)
        .filter((id): id is string => !!id);

      const investigations = await prisma.investigation.findMany({
        where: { id: { in: investigationIds } },
        select: { id: true, status: true },
      });

      const investigationMap = new Map(investigations.map(i => [i.id, i.status]));

      // Attach investigation status to each finding
      (hunt as any).findings = hunt.findings.map(f => ({
        ...f,
        investigationStatus: f.investigationId ? investigationMap.get(f.investigationId) : null,
      }));
    }

    // Return the hunt data. (Removed the status object overwrite bug)
    return NextResponse.json(hunt);
  } catch (error: any) {
    console.error('Error fetching threat hunt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch threat hunt', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/threat-hunts/[id] - Delete a threat hunt
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if the hunt exists
    const hunt = await prisma.threatHunt.findUnique({
      where: { id },
    });

    if (!hunt) {
      return NextResponse.json(
        { error: 'Threat hunt not found' },
        { status: 404 }
      );
    }

    // Only allow deletion of completed or failed hunts
    if (hunt.status === 'active' || hunt.status === 'paused') {
      return NextResponse.json(
        { error: 'Cannot delete active or paused hunts. Stop the hunt first.' },
        { status: 400 }
      );
    }

    // First delete all findings to avoid any constraint issues
    await prisma.threatFinding.deleteMany({
      where: { threatHuntId: id },
    });

    // Delete the threat hunt
    await prisma.threatHunt.delete({
      where: { id },
    });

    return NextResponse.json({
      message: 'Threat hunt deleted successfully',
      id,
    });
  } catch (error: any) {
    console.error('Error deleting threat hunt:', error);
    console.error('Error code:', error.code);
    console.error('Error meta:', error.meta);
    return NextResponse.json(
      { error: 'Failed to delete threat hunt', details: error.message, code: error.code },
      { status: 500 }
    );
  }
}