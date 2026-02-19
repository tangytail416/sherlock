import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const iocWhitelistSchema = z.object({
  type: z.enum(['username', 'hash', 'filename', 'ip', 'domain']),
  value: z.string().min(1, 'Value is required'),
  reason: z.string().optional(),
  addedBy: z.string().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// GET - List all whitelisted IOCs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const isActive = searchParams.get('isActive');

    const where: any = {};
    
    if (type) {
      where.type = type;
    }
    
    if (isActive !== null) {
      where.isActive = isActive === 'true';
    }

    const whitelists = await prisma.iOCWhitelist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ whitelists });
  } catch (error: any) {
    console.error('Error fetching IOC whitelists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch IOC whitelists', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Create new whitelisted IOC
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = iocWhitelistSchema.parse(body);

    // Check if this IOC already exists
    const existing = await prisma.iOCWhitelist.findUnique({
      where: {
        type_value: {
          type: validatedData.type,
          value: validatedData.value,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'This IOC is already whitelisted' },
        { status: 409 }
      );
    }

    const whitelist = await prisma.iOCWhitelist.create({
      data: {
        type: validatedData.type,
        value: validatedData.value,
        reason: validatedData.reason,
        addedBy: validatedData.addedBy,
        isActive: validatedData.isActive ?? true,
        metadata: validatedData.metadata,
      },
    });

    return NextResponse.json({ whitelist }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating IOC whitelist:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create IOC whitelist', details: error.message },
      { status: 500 }
    );
  }
}
