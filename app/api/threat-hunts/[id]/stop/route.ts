import { NextRequest, NextResponse } from 'next/server';
import { stopThreatHunt } from '@/lib/threat-hunting/workflow';

/**
 * POST /api/threat-hunts/[id]/stop - Stop an active threat hunt
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await stopThreatHunt(id);

    return NextResponse.json({
      message: 'Threat hunt stopped successfully',
      id,
    });
  } catch (error: any) {
    console.error('Error stopping threat hunt:', error);
    return NextResponse.json(
      { error: 'Failed to stop threat hunt', details: error.message },
      { status: 500 }
    );
  }
}
