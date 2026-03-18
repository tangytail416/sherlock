import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/ai-providers/[id]/test - Test AI provider connection
export async function POST(
  _request: NextRequest,
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

    // Test connection without consuming tokens by listing models
    const config = provider.config as any;
    const OpenAI = (await import('openai')).default;

    const client = new OpenAI({
      apiKey: config?.apiKey || '',
      baseURL: provider.baseUrl || undefined,
    });

    const startTime = Date.now();

    // List models - this validates API key and connection without consuming tokens
    const models = await client.models.list();
    const latency = Date.now() - startTime;

    // Get first few models for confirmation
    const modelsList = [];
    for await (const model of models) {
      modelsList.push(model.id);
      if (modelsList.length >= 3) break;
    }

    return NextResponse.json({
      success: true,
      message: 'Provider connection successful',
      details: {
        configured_model: provider.modelName,
        latency_ms: latency,
        tokens_used: 0,
        available_models_sample: modelsList,
      }
    });

  } catch (error: any) {
    console.error('Error testing AI provider:', error);

    // Provide detailed error messages for common issues
    let errorMessage = 'Connection test failed';
    let errorDetails = error.message;

    if (error.message?.includes('401') || error.message?.includes('authentication')) {
      errorMessage = 'Authentication failed - check API key';
    } else if (error.message?.includes('404') || error.message?.includes('not found')) {
      errorMessage = 'Model not found or invalid base URL';
    } else if (error.message?.includes('timeout')) {
      errorMessage = 'Connection timeout - check network and base URL';
    } else if (error.message?.includes('rate limit')) {
      errorMessage = 'Rate limit exceeded';
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: errorDetails
      },
      { status: 400 }
    );
  }
}
