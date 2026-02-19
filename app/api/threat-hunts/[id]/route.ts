import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getThreatHuntStatus } from '@/lib/threat-hunting/workflow';

const prisma = new PrismaClient();

/**
 * GET /api/threat-hunts/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing threat hunt id' },
        { status: 400 }
      );
    }

    const status = await getThreatHuntStatus(id);

    if (!status) {
      return NextResponse.json(
        { error: 'Threat hunt not found' },
        { status: 404 }
      );
    }

    const hunt = await prisma.threatHunt.findUnique({
      where: { id },
      include: {
        findings: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!hunt) {
      return NextResponse.json(
        { error: 'Threat hunt not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...hunt,
      status,
    });
  } catch (error: any) {
    console.error('GET threat hunt error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch threat hunt', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/threat-hunts/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    console.log('DELETE id:', id);

    if (!id || id === 'undefined') {
      return NextResponse.json(
        { error: 'Missing threat hunt id' },
        { status: 400 }
      );
    }

    const hunt = await prisma.threatHunt.findUnique({
      where: { id },
    });

    if (!hunt) {
      return NextResponse.json(
        { error: 'Threat hunt not found' },
        { status: 404 }
      );
    }

    // Optional safety check
    if (hunt.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot delete an active threat hunt' },
        { status: 400 }
      );
    }

    await prisma.threatHunt.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE threat hunt error:', error);
    return NextResponse.json(
      { error: 'Failed to delete threat hunt', details: error.message },
      { status: 500 }
    );
  }
}
