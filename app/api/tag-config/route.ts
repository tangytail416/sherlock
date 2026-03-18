import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const DEFAULT_TAG_CONFIGS = [
  { category: 'classification', values: ['false-positive', 'confirmed-incident', 'benign', 'inconclusive', 'testing'] },
  { category: 'threatType', values: ['malware', 'phishing', 'ransomware', 'lateral-movement', 'privilege-escalation', 'data-exfiltration', 'insider-threat', 'suspicious-logon', 'brute-force', 'command-execution'] },
  { category: 'campaign', values: ['APT29', 'FIN7', 'Carbanak', 'Lazarus', 'Cozy-Bear', 'DarkSide', 'REvil'] },
];

// GET /api/tag-config - Get all tag configurations
export async function GET() {
  try {
    let tagConfigs = await prisma.tagConfig.findMany({
      orderBy: { category: 'asc' },
    });

    // Seed defaults if none exist
    if (tagConfigs.length === 0) {
      for (const config of DEFAULT_TAG_CONFIGS) {
        await prisma.tagConfig.create({
          data: config,
        });
      }
      tagConfigs = await prisma.tagConfig.findMany({
        orderBy: { category: 'asc' },
      });
    }

    return NextResponse.json(tagConfigs);
  } catch (error) {
    console.error('Error fetching tag configs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tag configs' },
      { status: 500 }
    );
  }
}

// POST /api/tag-config - Create or update a tag configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, values } = body;

    if (!category || !values || !Array.isArray(values)) {
      return NextResponse.json(
        { error: 'Category and values are required' },
        { status: 400 }
      );
    }

    const tagConfig = await prisma.tagConfig.upsert({
      where: { category },
      update: { values },
      create: { category, values },
    });

    return NextResponse.json(tagConfig);
  } catch (error) {
    console.error('Error saving tag config:', error);
    return NextResponse.json(
      { error: 'Failed to save tag config' },
      { status: 500 }
    );
  }
}
