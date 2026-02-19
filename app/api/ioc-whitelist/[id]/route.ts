import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateSchema = z.object({
  reason: z.string().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// PATCH - Update whitelisted IOC
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validatedData = updateSchema.parse(body);

    const whitelist = await prisma.iOCWhitelist.update({
      where: { id },
      data: validatedData,
    });

    return NextResponse.json({ whitelist });
  } catch (error: any) {
    console.error('Error updating IOC whitelist:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'IOC whitelist not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update IOC whitelist', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove whitelisted IOC
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.iOCWhitelist.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'IOC whitelist deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting IOC whitelist:', error);

    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'IOC whitelist not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete IOC whitelist', details: error.message },
      { status: 500 }
    );
  }
}
