import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/threat-hunts/[id]/findings - List findings for a specific threat hunt
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;

    // Query parameters
    const severity = searchParams.get('severity');
    const status = searchParams.get('status');
    const findingType = searchParams.get('findingType');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Verify threat hunt exists
    const hunt = await prisma.threatHunt.findUnique({
      where: { id },
    });

    if (!hunt) {
      return NextResponse.json(
        { error: 'Threat hunt not found' },
        { status: 404 }
      );
    }

    // Build where clause
    const where: any = { threatHuntId: id };
    if (severity) where.severity = severity;
    if (status) where.status = status;
    if (findingType) where.findingType = findingType;

    // Fetch findings
    const [findings, total] = await Promise.all([
      prisma.threatFinding.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.threatFinding.count({ where }),
    ]);

    // Get summary stats
    const allFindings = await prisma.threatFinding.findMany({
      where: { threatHuntId: id },
      select: { severity: true, status: true, findingType: true },
    });

    const summary = {
      total: allFindings.length,
      by_severity: {
        critical: allFindings.filter((f) => f.severity === 'critical').length,
        high: allFindings.filter((f) => f.severity === 'high').length,
        medium: allFindings.filter((f) => f.severity === 'medium').length,
        low: allFindings.filter((f) => f.severity === 'low').length,
      },
      by_status: {
        pending: allFindings.filter((f) => f.status === 'pending').length,
        investigating: allFindings.filter((f) => f.status === 'investigating').length,
        dismissed: allFindings.filter((f) => f.status === 'dismissed').length,
      },
      by_type: allFindings.reduce((acc, f) => {
        acc[f.findingType] = (acc[f.findingType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return NextResponse.json({
      findings,
      summary,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error: any) {
    console.error('Error fetching threat hunt findings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch findings', details: error.message },
      { status: 500 }
    );
  }
}
