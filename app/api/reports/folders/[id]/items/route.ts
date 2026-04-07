import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: folderId } = await params;
    const body = await request.json();
    const { reportIds } = body;

    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      return NextResponse.json(
        { error: 'reportIds array is required' },
        { status: 400 }
      );
    }

    const folder = await prisma.reportFolder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    const existingItems = await prisma.reportFolderItem.findMany({
      where: {
        folderId,
        reportId: { in: reportIds },
      },
    });

    const existingReportIds = new Set(existingItems.map((item) => item.reportId));
    const newReportIds = reportIds.filter((id) => !existingReportIds.has(id));

    if (newReportIds.length > 0) {
      await prisma.reportFolderItem.createMany({
        data: newReportIds.map((reportId) => ({
          folderId,
          reportId,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      added: newReportIds.length,
      skipped: existingReportIds.size,
    });
  } catch (error) {
    console.error('Error adding reports to folder:', error);
    return NextResponse.json(
      { error: 'Failed to add reports to folder' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: folderId } = await params;
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');

    if (reportId) {
      await prisma.reportFolderItem.deleteMany({
        where: { folderId, reportId },
      });
    } else {
      await prisma.reportFolderItem.deleteMany({
        where: { folderId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing reports from folder:', error);
    return NextResponse.json(
      { error: 'Failed to remove reports from folder' },
      { status: 500 }
    );
  }
}
