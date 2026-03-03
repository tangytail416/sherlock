import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/alerts/[id]/delete
 * Deletes an alert by its ID.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete the alert from the database
    await prisma.alert.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Alert deleted successfully',
      id,
    });
  } catch (error: any) {
    // Prisma error code P2025 means "Record to delete does not exist."
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    console.error('Error deleting alert:', error);
    return NextResponse.json(
      { error: 'Failed to delete alert', details: error.message },
      { status: 500 }
    );
  }
}