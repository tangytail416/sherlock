import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateInvestigationReport } from '@/lib/agents/report-generator';

// POST /api/reports/generate - Generate a report from investigation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { investigationId, regenerate = false } = body;

    if (!investigationId) {
      return NextResponse.json(
        { error: 'investigationId is required' },
        { status: 400 }
      );
    }

    // Verify investigation exists
    const investigation = await prisma.investigation.findUnique({
      where: { id: investigationId },
      select: { id: true }
    });

    if (!investigation) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    // If regenerating, delete the old report(s)
    if (regenerate) {
      await prisma.report.deleteMany({
        where: { investigationId },
      });
    }

    // Generate report using shared utility
    const report = await generateInvestigationReport({
      investigationId,
      includeGraphContext: true,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate report',
        details: error.message
      },
      { status: 500 }
    );
  }
}
