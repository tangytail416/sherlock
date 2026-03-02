import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/queries/[id] - Get query details with effectiveness stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const query = await prisma.savedQuery.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 executions
        },
        threatFindings: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 findings
          select: {
            id: true,
            findingType: true,
            severity: true,
            description: true,
            detectedAt: true,
            status: true,
          },
        },
        _count: {
          select: {
            executions: true,
            threatFindings: true,
          },
        },
      },
    });

    if (!query) {
      return NextResponse.json(
        { error: 'Query not found' },
        { status: 404 }
      );
    }

    // Calculate effectiveness metrics
    const successfulExecutions = query.executions.filter(
      (e) => e.status === 'success'
    ).length;
    const avgExecutionTime =
      query.executions.length > 0
        ? query.executions.reduce(
            (sum, e) => sum + (e.executionTimeMs || 0),
            0
          ) / query.executions.length
        : 0;

    return NextResponse.json({
      ...query,
      stats: {
        successRate:
          query.executionsCount > 0
            ? (successfulExecutions / Math.min(query.executionsCount, 10)) * 100
            : 0,
        avgExecutionTimeMs: Math.round(avgExecutionTime),
        totalFindings: query._count.threatFindings,
        totalExecutions: query._count.executions,
      },
    });
  } catch (error) {
    console.error('Error fetching query:', error);
    return NextResponse.json(
      { error: 'Failed to fetch query' },
      { status: 500 }
    );
  }
}

// PUT /api/queries/[id] - Update a query
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: any = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.splQuery !== undefined) updateData.splQuery = body.splQuery;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.severity !== undefined) updateData.severity = body.severity;
    if (body.mitreAttack !== undefined) updateData.mitreAttack = body.mitreAttack;

    const query = await prisma.savedQuery.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(query);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Query not found' },
        { status: 404 }
      );
    }

    console.error('Error updating query:', error);
    return NextResponse.json(
      { error: 'Failed to update query' },
      { status: 500 }
    );
  }
}

// DELETE /api/queries/[id] - Delete a query
// DELETE /api/queries/[id] - Delete a query (or ALL queries)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // === ADD THIS BLOCK TO INTERCEPT "DELETE ALL" ===
    if (id === 'delete-all') {
      await prisma.savedQuery.deleteMany({});
      return NextResponse.json({ success: true, message: 'All queries deleted' });
    }
    // ================================================

    // Normal single-deletion logic
    await prisma.savedQuery.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Query not found' },
        { status: 404 }
      );
    }

    console.error('Error deleting query:', error);
    return NextResponse.json(
      { error: 'Failed to delete query' },
      { status: 500 }
    );
  }
}

// PATCH /api/queries/[id] - Update a query (Partial Update)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: any = {};

    // Only update fields that are actually provided in the request body
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.splQuery !== undefined) updateData.splQuery = body.splQuery;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.severity !== undefined) updateData.severity = body.severity;
    if (body.mitreAttack !== undefined) updateData.mitreAttack = body.mitreAttack;

    const query = await prisma.savedQuery.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(query);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Query not found' },
        { status: 404 }
      );
    }

    console.error('Error updating query:', error);
    return NextResponse.json(
      { error: 'Failed to update query' },
      { status: 500 }
    );
  }
}


