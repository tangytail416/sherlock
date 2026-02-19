import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateInvestigationSchema } from '@/lib/validations/investigation';

// FIX: Force dynamic rendering to prevent caching stale data
export const dynamic = 'force-dynamic';

// GET /api/investigations/[id] - Get a single investigation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const investigation = await prisma.investigation.findUnique({
      where: { id },
      include: {
        alert: true,
        agentExecutions: {
          where: {
            OR: [
              { errorMessage: null },
              { errorMessage: { not: 'Superseded by restart' } },
            ],
          },
          orderBy: { createdAt: 'asc' },
        },
        reports: true,
      },
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(investigation);
  } catch (error) {
    console.error('Error fetching investigation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch investigation' },
      { status: 500 }
    );
  }
}

// ... (Rest of PATCH and DELETE handlers remain the same) ...
// PATCH /api/investigations/[id] - Update an investigation
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validatedData = updateInvestigationSchema.parse(body);

    const updateData: any = { ...validatedData };

    // Set completion timestamp if status is completed or failed
    if (validatedData.status === 'completed' || validatedData.status === 'failed') {
      updateData.completedAt = new Date();
    }

    const investigation = await prisma.investigation.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(investigation);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    console.error('Error updating investigation:', error);
    return NextResponse.json(
      { error: 'Failed to update investigation' },
      { status: 500 }
    );
  }
}

// DELETE /api/investigations/[id] - Delete an investigation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.investigation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    console.error('Error deleting investigation:', error);
    return NextResponse.json(
      { error: 'Failed to delete investigation' },
      { status: 500 }
    );
  }
}