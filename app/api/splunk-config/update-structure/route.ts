import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Update the index structure in database (for user edits)
 * PUT /api/splunk-config/update-structure
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { structure } = body;

    if (!structure) {
      return NextResponse.json(
        { error: 'Structure is required' },
        { status: 400 }
      );
    }

    // Get active Splunk config
    const config = await prisma.splunkConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return NextResponse.json(
        { error: 'No active Splunk configuration found' },
        { status: 404 }
      );
    }

    // Update the structure
    await prisma.splunkConfig.update({
      where: { id: config.id },
      data: {
        indexStructure: structure,
      },
    });

    console.log('[Update Structure] Structure updated successfully');

    return NextResponse.json({
      success: true,
      message: 'Structure updated successfully',
    });
  } catch (error: any) {
    console.error('[Update Structure] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update structure',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
