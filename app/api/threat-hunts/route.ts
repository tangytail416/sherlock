import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { startThreatHunt } from '@/lib/threat-hunting/workflow';
import type { ThreatHuntConfig } from '@/lib/agents/types';

const prisma = new PrismaClient();

/**
 * GET /api/threat-hunts - List all threat hunts
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [hunts, total] = await Promise.all([
      prisma.threatHunt.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          findings: {
            select: {
              id: true,
              severity: true,
              findingType: true,
              status: true,
            },
          },
        },
      }),
      prisma.threatHunt.count({ where }),
    ]);

    // Add summary stats to each hunt
    const huntsWithStats = hunts.map((hunt) => {
      const critical = hunt.findings.filter((f) => f.severity === 'critical').length;
      const high = hunt.findings.filter((f) => f.severity === 'high').length;
      const medium = hunt.findings.filter((f) => f.severity === 'medium').length;
      const low = hunt.findings.filter((f) => f.severity === 'low').length;

      return {
        ...hunt,
        findingsSummary: {
          critical,
          high,
          medium,
          low,
        },
      };
    });

    return NextResponse.json({
      hunts: huntsWithStats,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching threat hunts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch threat hunts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/threat-hunts - Start a new threat hunt
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate and parse config
    const config: Partial<ThreatHuntConfig> = {
      patterns: body.patterns || undefined,
      maxCycles: body.maxCycles || 10,
      cycleIntervalSeconds: body.cycleIntervalSeconds || 300,
      maxFindingsPerPattern: body.maxFindingsPerPattern || 5,
      minSeverityForInvestigation: body.minSeverityForInvestigation || 'medium',
      deduplicationWindowHours: body.deduplicationWindowHours || 24,
      autoCreateInvestigations: body.autoCreateInvestigations !== false, // Default true
      autoStartInvestigations: body.autoStartInvestigations === true, // Default false - user starts manually
      aiProvider: body.aiProvider || undefined,
      modelUsed: body.modelUsed || undefined,
      timeRange: body.timeRange || undefined, // { earliest: "...", latest: "..." }
      focusAreas: body.focusAreas || undefined, // e.g., ["rootkit", "brute_force"]
    };

    // Get default AI provider if not specified
    if (!config.aiProvider) {
      const defaultProvider = await prisma.aIProvider.findFirst({
        where: { isActive: true, isDefault: true },
      });

      if (defaultProvider) {
        config.aiProvider = defaultProvider.type;
        config.modelUsed = defaultProvider.modelName;
        console.log(`[Threat Hunt] Using default AI provider: ${config.aiProvider} (${config.modelUsed})`);
      } else {
        // Fallback to a local model for threat hunting
        console.warn('[Threat Hunt] No default AI provider found, using fallback');
        config.aiProvider = 'glm';
        config.modelUsed = 'glm-4-plus';
      }
    }

    // Start threat hunt workflow
    const threatHuntId = await startThreatHunt(config);

    // Fetch the created hunt with initial data
    const hunt = await prisma.threatHunt.findUnique({
      where: { id: threatHuntId },
      include: {
        findings: true,
      },
    });

    return NextResponse.json(hunt, { status: 201 });
  } catch (error: any) {
    console.error('Error starting threat hunt:', error);
    return NextResponse.json(
      { error: 'Failed to start threat hunt', details: error.message },
      { status: 500 }
    );
  }
}
