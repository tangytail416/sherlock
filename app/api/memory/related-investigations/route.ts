import { NextRequest, NextResponse } from 'next/server';
import { findRelatedFindings, extractEntities } from '@/lib/memory/graph-memory';
import { prisma } from '@/lib/db';

// POST /api/memory/related-investigations - Find related investigations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { investigationId, limit } = body;

    if (!investigationId) {
      return NextResponse.json(
        { error: 'Investigation ID is required' },
        { status: 400 }
      );
    }

    // Get investigation with alert data to extract entities
    const investigation = await prisma.investigation.findUnique({
      where: { id: investigationId },
      include: { alert: true },
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    // Extract entities from alert
    const alertData = investigation.alert.rawData as any;
    const entities = extractEntities(investigation.alert.title, alertData);

    // Find related findings
    const related = await findRelatedFindings(entities);

    // Extract unique investigation IDs from original IDs
    const investigationIds = [...new Set(
      related
        .map((r) => r.originalId)
        .filter((id): id is string => !!id)
    )];

    // Fetch full investigation details from PostgreSQL
    if (investigationIds.length > 0) {
      const investigations = await prisma.investigation.findMany({
        where: { id: { in: investigationIds } },
        include: {
          alert: true,
          reports: {
            select: {
              id: true,
              title: true,
              summary: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        take: limit || 10,
      });

      return NextResponse.json({
        relatedInvestigations: investigations.map((inv) => ({
          id: inv.id,
          alert: inv.alert,
          status: inv.status,
          latestReport: inv.reports[0],
          relatedFindings: related.filter((r) => r.originalId === inv.id),
        })),
        count: investigations.length,
      });
    }

    return NextResponse.json({
      relatedInvestigations: [],
      count: 0,
    });
  } catch (error: any) {
    console.error('Error finding related investigations:', error);
    return NextResponse.json(
      { error: 'Failed to find related investigations', details: error.message },
      { status: 500 }
    );
  }
}
