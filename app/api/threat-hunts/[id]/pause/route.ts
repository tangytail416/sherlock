import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/threat-hunts/[id]/pause - Pause an active threat hunt
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const threatHunt = await prisma.threatHunt.update({
      where: { id },
      data: {
        status: 'paused',
      },
    });

    return NextResponse.json({
      message: 'Threat hunt paused successfully',
      id,
      status: threatHunt.status,
    });
  } catch (error: any) {
    console.error('Error pausing threat hunt:', error);
    return NextResponse.json(
      { error: 'Failed to pause threat hunt', details: error.message },
      { status: 500 }
    );
  }
}
