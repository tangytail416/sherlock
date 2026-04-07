import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const investigationId = searchParams.get('investigationId');
    const folderId = searchParams.get('folderId');

    // @ts-ignore - Prisma client not regenerated yet
    const where: any = {};
    if (investigationId) where.investigationId = investigationId;
    if (folderId) where.folders = { some: { folderId } };

    const reports = await prisma.report.findMany({
      where,
      include: {
        investigation: {
          include: {
            alert: true,
          },
        },
        folders: {
          include: {
            folder: {
              select: {
                id: true,
                name: true,
                color: true,
                icon: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reportsWithFolders = reports.map((report: any) => {
      const content = report.content as any;
      const isAggregated = report.investigationId === null;
      
      return {
        id: report.id,
        title: report.title,
        summary: report.summary,
        createdAt: report.createdAt,
        isAggregated,
        investigation: report.investigation,
        folders: report.folders.map((f: any) => f.folder),
        aggregatedCount: isAggregated ? content?.aggregatedFrom?.length : undefined,
        aggregatedSeverity: isAggregated ? content?.severity : undefined,
      };
    });

    return NextResponse.json({ reports: reportsWithFolders });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}

// POST /api/reports - Create a new report (usually generated from investigation)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { investigationId, title, summary, findings, recommendations, severity } = body;

    if (!investigationId || !title) {
      return NextResponse.json(
        { error: 'investigationId and title are required' },
        { status: 400 }
      );
    }

    // Verify investigation exists
    const investigation = await prisma.investigation.findUnique({
      where: { id: investigationId },
      include: {
        alert: true,
        agentExecutions: {
          where: { status: 'completed' },
          orderBy: { completedAt: 'desc' },
        },
      },
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    const report = await prisma.report.create({
      data: {
        investigationId,
        title,
        summary,
        content: {
          findings: findings || {},
          severity: severity || investigation.alert.severity,
        } as any,
        recommendations: Array.isArray(recommendations) ? recommendations.join('\n') : (recommendations || ''),
      },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error('Error creating report:', error);
    return NextResponse.json(
      { error: 'Failed to create report' },
      { status: 500 }
    );
  }
}
