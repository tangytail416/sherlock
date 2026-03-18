import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateAlertSchema } from '@/lib/validations/alert';

// GET /api/alerts/[id] - Get a single alert
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const alert = await prisma.alert.findUnique({
      where: { id },
      include: {
        investigations: {
          include: {
            agentExecutions: {
              select: {
                id: true,
                agentName: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json(alert);
  } catch (error) {
    console.error('Error fetching alert:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alert' },
      { status: 500 }
    );
  }
}

// PATCH /api/alerts/[id] - Update an alert
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validatedData = updateAlertSchema.parse(body);

    const alert = await prisma.alert.update({
      where: { id },
      data: validatedData,
    });

    return NextResponse.json(alert);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    console.error('Error updating alert:', error);
    return NextResponse.json(
      { error: 'Failed to update alert' },
      { status: 500 }
    );
  }
}

// DELETE /api/alerts/[id] - Delete an alert
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      // 1. Check if there is a ThreatFinding linked to this alert
      const linkedFinding = await tx.threatFinding.findFirst({
        where: { alertId: id },
      });

      if (linkedFinding) {
        // 2. Decrement the findingsCount on the parent ThreatHunt
        await tx.threatHunt.update({
          where: { id: linkedFinding.threatHuntId },
          data: {
            findingsCount: { decrement: 1 },
          },
        });

        // 3. Explicitly delete the ThreatFinding to prevent orphaned records
        await tx.threatFinding.delete({
          where: { id: linkedFinding.id },
        });
      }

      // 4. Finally, delete the Alert itself
      await tx.alert.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    console.error('Error deleting alert:', error);
    return NextResponse.json(
      { error: 'Failed to delete alert' },
      { status: 500 }
    );
  }
}