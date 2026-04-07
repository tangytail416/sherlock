import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { DEFAULT_COLORS, ColorStyle } from '@/lib/constants/colors';

export async function GET() {
  try {
    let colorConfigs = await prisma.colorConfig.findMany({
      orderBy: { category: 'asc' },
    });

    if (colorConfigs.length === 0) {
      for (const [category, colors] of Object.entries(DEFAULT_COLORS)) {
        await prisma.colorConfig.create({
          data: { category, colors: colors as Record<string, ColorStyle> },
        });
      }
      colorConfigs = await prisma.colorConfig.findMany({
        orderBy: { category: 'asc' },
      });
    }

    return NextResponse.json(colorConfigs);
  } catch (error) {
    console.error('Error fetching color configs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch color configs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, colors } = body;

    if (!category || !colors) {
      return NextResponse.json(
        { error: 'Category and colors are required' },
        { status: 400 }
      );
    }

    const colorConfig = await prisma.colorConfig.upsert({
      where: { category },
      update: { colors },
      create: { category, colors },
    });

    return NextResponse.json(colorConfig);
  } catch (error) {
    console.error('Error saving color config:', error);
    return NextResponse.json(
      { error: 'Failed to save color config' },
      { status: 500 }
    );
  }
}
