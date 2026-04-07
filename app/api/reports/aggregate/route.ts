import { NextRequest, NextResponse } from 'next/server';
import { aggregateReports } from '@/lib/agents/report-aggregator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportIds, folderId, folderName, aiProvider } = body;

    if (!reportIds || !Array.isArray(reportIds)) {
      return NextResponse.json(
        { error: 'reportIds must be an array' },
        { status: 400 }
      );
    }

    if (reportIds.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 reports are required for aggregation' },
        { status: 400 }
      );
    }

    if (reportIds.length > 15) {
      return NextResponse.json(
        { error: 'Maximum 15 reports can be aggregated at once' },
        { status: 400 }
      );
    }

    if (!folderId || typeof folderId !== 'string') {
      return NextResponse.json(
        { error: 'folderId is required' },
        { status: 400 }
      );
    }

    if (!folderName || typeof folderName !== 'string') {
      return NextResponse.json(
        { error: 'folderName is required' },
        { status: 400 }
      );
    }

    const report = await aggregateReports({
      reportIds,
      folderId,
      folderName,
      aiProvider,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error('Error aggregating reports:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to aggregate reports' },
      { status: 500 }
    );
  }
}
