import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateInvestigationReport } from '@/lib/agents/report-generator';

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

    if (regenerate) {
      await prisma.report.deleteMany({
        where: { investigationId },
      });
    }

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
