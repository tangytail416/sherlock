import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSplunkClientFromDB } from '@/lib/splunk/client';
import { getActiveWhitelistedIOCs, filterWhitelistedFromSplunkResults } from '@/lib/agents/whitelist-helper';

// POST /api/queries/[id]/execute - Execute a saved query
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();

  try {
    const { id } = await params;
    const body = await request.json();

    // Get the query from database
    const query = await prisma.savedQuery.findUnique({
      where: { id },
    });

    if (!query) {
      return NextResponse.json(
        { error: 'Query not found' },
        { status: 404 }
      );
    }

    // Get Splunk client
    const splunkClient = await createSplunkClientFromDB();

    if (!splunkClient) {
      return NextResponse.json(
        { error: 'Splunk not configured' },
        { status: 500 }
      );
    }

    // Parse time range from request
    const earliestTime = body.earliestTime || '-24h';
    const latestTime = body.latestTime || 'now';

    // Ensure query starts with "search" command if it doesn't already
    let searchQuery = query.splQuery.trim();
    if (!searchQuery.startsWith('search ') && !searchQuery.startsWith('|')) {
      searchQuery = 'search ' + searchQuery;
    }

    console.log(`[Query Execute] Executing query: ${query.name}`);
    console.log(`[Query Execute] Time range: ${earliestTime} to ${latestTime}`);

    // Execute the query
    let results: any;
    let status = 'success';
    let errorMessage: string | null = null;

    try {
      results = await splunkClient.oneshot(searchQuery, {
        earliestTime,
        latestTime,
        maxResults: body.maxResults || 1000,
      });
    } catch (error: any) {
      console.error('[Query Execute] Error:', error);
      status = 'failed';
      errorMessage = error.message || 'Unknown error';
      results = [];
    }

    const executionTime = Date.now() - startTime;

    // Log the execution
    await prisma.queryExecution.create({
      data: {
        savedQueryId: id,
        executedBy: body.executedBy || 'user',
        status,
        resultCount: results?.length || 0,
        executionTimeMs: executionTime,
        timeRange: {
          earliest: earliestTime,
          latest: latestTime,
        },
        errorMessage,
      },
    });

    // Update query stats
    await prisma.savedQuery.update({
      where: { id },
      data: {
        executionsCount: { increment: 1 },
        lastExecutedAt: new Date(),
      },
    });

    if (status === 'failed') {
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    return NextResponse.json({
      results,
      executionTimeMs: executionTime,
      resultCount: results?.length || 0,
      query: {
        id: query.id,
        name: query.name,
      },
    });
  } catch (error) {
    console.error('Error executing query:', error);

    // Try to log failed execution if we have the query ID
    try {
      const { id } = await params;
      await prisma.queryExecution.create({
        data: {
          savedQueryId: id,
          executedBy: 'user',
          status: 'failed',
          executionTimeMs: Date.now() - startTime,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    } catch (logError) {
      console.error('Failed to log execution error:', logError);
    }

    return NextResponse.json(
      { error: 'Failed to execute query' },
      { status: 500 }
    );
  }
}
