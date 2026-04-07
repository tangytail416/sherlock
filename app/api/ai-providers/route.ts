import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createProviderSchema = z.object({
  name: z.string().min(1),
  providerType: z.enum(['glm', 'openai', 'azure', 'openrouter']),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  modelName: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  isDefault: z.boolean().optional(),
});

// GET /api/ai-providers - List all AI providers
export async function GET() {
  try {
    const providers = await prisma.aIProvider.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    // Don't expose full API keys in list view - flatten config for frontend
    const sanitizedProviders = providers.map((provider) => {
      const config = provider.config as any;
      return {
        ...provider,
        apiKey: config?.apiKey ? `${config.apiKey.substring(0, 8)}...` : null,
        temperature: config?.temperature ?? null,
        maxTokens: config?.maxTokens ?? null,
      };
    });

    return NextResponse.json({ providers: sanitizedProviders });
  } catch (error) {
    console.error('Error fetching AI providers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI providers' },
      { status: 500 }
    );
  }
}

// POST /api/ai-providers - Create new AI provider
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createProviderSchema.parse(body);

    // If this is set as default, unset any existing default
    if (validated.isDefault) {
      await prisma.aIProvider.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const provider = await prisma.aIProvider.create({
      data: {
        name: validated.name,
        type: validated.providerType,
        baseUrl: validated.baseUrl,
        modelName: validated.modelName,
        isDefault: validated.isDefault ?? false,
        config: {
          apiKey: validated.apiKey,
          temperature: validated.temperature ?? 0.1,
          maxTokens: validated.maxTokens ?? 4096,
        },
      },
    });

    // Flatten config for frontend
    const config = provider.config as any;
    const flatProvider = {
      ...provider,
      apiKey: config?.apiKey ?? null,
      temperature: config?.temperature ?? null,
      maxTokens: config?.maxTokens ?? null,
    };

    return NextResponse.json({ provider: flatProvider }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating AI provider:', error);
    return NextResponse.json(
      { error: 'Failed to create AI provider' },
      { status: 500 }
    );
  }
}
