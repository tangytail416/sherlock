import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Check if this alert was spawned by a Threat Hunt Finding
    const associatedFinding = await prisma.threatFinding.findFirst({
      where: { alertId: id }
    });

    // 2. Perform all deletions in a safe transaction
    await prisma.$transaction(async (tx) => {
      
      // If there is an associated finding, clean it up and fix the math
      if (associatedFinding) {
        // Decrement the finding count on the parent Threat Hunt
        if (associatedFinding.threatHuntId) {
          await tx.threatHunt.update({
            where: { id: associatedFinding.threatHuntId },
            data: {
              findingsCount: { decrement: 1 }
            }
          });
        }
        
        // Delete the ThreatFinding
        await tx.threatFinding.delete({
          where: { id: associatedFinding.id }
        });
      }

      // 3. Delete the Alert itself 
      // (Assuming your schema uses onDelete: Cascade for Investigations and Reports, 
      // those will be automatically wiped out alongside the alert)
      await tx.alert.delete({
        where: { id },
      });
      
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert and associated finding:', error);
    return NextResponse.json(
      { error: 'Failed to delete alert' },
      { status: 500 }
    );
  }
}