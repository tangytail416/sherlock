import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/reports - List all reports
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const investigationId = searchParams.get('investigationId');

    const where = investigationId ? { investigationId } : {};

    const reports = await prisma.report.findMany({
      where,
      include: {
        investigation: {
          include: {
            alert: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ reports });
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
