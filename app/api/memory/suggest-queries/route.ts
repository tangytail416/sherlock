import { NextRequest, NextResponse } from 'next/server';
import { suggestQueriesForAlert } from '@/lib/memory/query-memory';

// POST /api/memory/suggest-queries - Get query suggestions for an alert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alertData, limit } = body;

    if (!alertData) {
      return NextResponse.json({ error: 'Alert data is required' }, { status: 400 });
    }

    const suggestions = await suggestQueriesForAlert(alertData, limit || 10);

    return NextResponse.json({
      suggestions,
      count: suggestions.length,
    });
  } catch (error: any) {
    console.error('Error suggesting queries:', error);
    return NextResponse.json(
      { error: 'Failed to suggest queries', details: error.message },
      { status: 500 }
    );
  }
}
