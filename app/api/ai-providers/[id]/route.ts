import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().nullable(),
  modelName: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/ai-providers/[id] - Get single AI provider
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const provider = await prisma.aIProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      return NextResponse.json(
        { error: 'AI provider not found' },
        { status: 404 }
      );
    }

    // Flatten config for frontend
    const config = provider.config as any;
    const flatProvider = {
      ...provider,
      apiKey: config?.apiKey ?? null,
      temperature: config?.temperature ?? null,
      maxTokens: config?.maxTokens ?? null,
    };

    return NextResponse.json({ provider: flatProvider });
  } catch (error) {
    console.error('Error fetching AI provider:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI provider' },
      { status: 500 }
    );
  }
}

// PATCH /api/ai-providers/[id] - Update AI provider
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateProviderSchema.parse(body);

    // Check if provider exists
    const existing = await prisma.aIProvider.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'AI provider not found' },
        { status: 404 }
      );
    }

    // If setting as default, unset other defaults
    if (validated.isDefault) {
      await prisma.aIProvider.updateMany({
        where: {
          id: { not: id },
          isDefault: true
        },
        data: { isDefault: false },
      });
    }

    // Build update data
    const updateData: any = {
      name: validated.name,
      baseUrl: validated.baseUrl,
      modelName: validated.modelName,
      isDefault: validated.isDefault,
      isActive: validated.isActive,
    };

    // If apiKey, temperature, or maxTokens are provided, update the config JSON
    if (validated.apiKey || validated.temperature !== undefined || validated.maxTokens !== undefined) {
      const existingConfig = (existing.config as any) || {};
      updateData.config = {
        ...existingConfig,
        ...(validated.apiKey && { apiKey: validated.apiKey }),
        ...(validated.temperature !== undefined && { temperature: validated.temperature }),
        ...(validated.maxTokens !== undefined && { maxTokens: validated.maxTokens }),
      };
    }

    const provider = await prisma.aIProvider.update({
      where: { id },
      data: updateData,
    });

    // Flatten config for frontend
    const updatedConfig = provider.config as any;
    const flatProvider = {
      ...provider,
      apiKey: updatedConfig?.apiKey ?? null,
      temperature: updatedConfig?.temperature ?? null,
      maxTokens: updatedConfig?.maxTokens ?? null,
    };

    return NextResponse.json({ provider: flatProvider });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error 67676767676767', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating AI provider:', error);
    return NextResponse.json(
      { error: 'Failed to update AI provider' },
      { status: 500 }
    );
  }
}

// DELETE /api/ai-providers/[id] - Delete AI provider
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if provider exists
    const existing = await prisma.aIProvider.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'AI provider not found' },
        { status: 404 }
      );
    }

    // Check if it's being used by any investigations
    const investigationCount = await prisma.investigation.count({
      where: { aiProvider: existing.type },
    });

    if (investigationCount > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete provider',
          message: `This provider is used by ${investigationCount} investigation(s)`
        },
        { status: 400 }
      );
    }

    await prisma.aIProvider.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting AI provider:', error);
    return NextResponse.json(
      { error: 'Failed to delete AI provider' },
      { status: 500 }
    );
  }
}
