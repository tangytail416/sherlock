import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createAlertSchema } from '@/lib/validations/alert';

// GET /api/alerts - List all alerts with optional filtering
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        include: {
          investigations: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
      prisma.alert.count({ where }),
    ]);

    return NextResponse.json({
      alerts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

// POST /api/alerts - Create a new alert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createAlertSchema.parse(body);

    const alert = await prisma.alert.create({
      data: {
        source: validatedData.source,
        severity: validatedData.severity,
        title: validatedData.title,
        description: validatedData.description || '',
        rawData: (validatedData.rawData || {}) as any,
        timestamp: validatedData.timestamp
          ? new Date(validatedData.timestamp)
          : new Date(),
        status: 'new',
      },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    console.error('Error creating alert:', error);
    return NextResponse.json(
      { error: 'Failed to create alert' },
      { status: 500 }
    );
  }
}
