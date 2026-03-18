import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { QueryCategory } from '@prisma/client';

// GET /api/queries - List all queries with optional filtering
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const severity = searchParams.get('severity');
    const search = searchParams.get('search');
    const isAutomated = searchParams.get('isAutomated');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};

    if (category && Object.values(QueryCategory).includes(category as QueryCategory)) {
      where.category = category;
    }

    if (severity) {
      where.severity = severity;
    }

    if (isAutomated !== null && isAutomated !== undefined && isAutomated !== '') {
      where.isAutomated = isAutomated === 'true';
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { splQuery: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [queries, total] = await Promise.all([
      prisma.savedQuery.findMany({
        where,
        orderBy: { lastExecutedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: {
            select: {
              executions: true,
              threatFindings: true,
            },
          },
        },
      }),
      prisma.savedQuery.count({ where }),
    ]);

    return NextResponse.json({
      queries,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching queries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queries' },
      { status: 500 }
    );
  }
}

// POST /api/queries - Create a new query
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.splQuery) {
      return NextResponse.json(
        { error: 'Name and SPL query are required' },
        { status: 400 }
      );
    }

    const query = await prisma.savedQuery.create({
      data: {
        name: body.name,
        description: body.description || null,
        splQuery: body.splQuery,
        category: body.category || 'other',
        severity: body.severity || null,
        mitreAttack: body.mitreAttack || null,
        isAutomated: body.isAutomated || false,
      },
    });

    return NextResponse.json(query, { status: 201 });
  } catch (error) {
    console.error('Error creating query:', error);
    return NextResponse.json(
      { error: 'Failed to create query' },
      { status: 500 }
    );
  }
}

// DELETE /api/queries - Delete all queries
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deleteAll = searchParams.get('deleteAll');

    if (deleteAll === 'true') {
      await prisma.savedQuery.deleteMany({});
      return NextResponse.json({ success: true, message: 'All queries deleted' });
    }

    return NextResponse.json(
      { error: 'Invalid delete action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting queries:', error);
    return NextResponse.json(
      { error: 'Failed to delete queries' },
      { status: 500 }
    );
  }
}
