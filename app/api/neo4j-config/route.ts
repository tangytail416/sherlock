import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/neo4j-config - Get Neo4j configuration
export async function GET() {
  try {
    const config = await prisma.neo4jConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return NextResponse.json({ config: null });
    }

    // Return config without sensitive data
    const safeConfig = {
      ...config,
      password: config.password ? '********' : null,
    };

    return NextResponse.json({ config: safeConfig });
  } catch (error: any) {
    console.error('Error fetching Neo4j config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Neo4j configuration' },
      { status: 500 }
    );
  }
}

// POST /api/neo4j-config - Create or update Neo4j configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uri, username, password, database } = body;

    // Validation
    if (!uri) {
      return NextResponse.json({ error: 'URI is required' }, { status: 400 });
    }

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Validate URI format
    if (!uri.startsWith('bolt://') && !uri.startsWith('neo4j://')) {
      return NextResponse.json(
        { error: 'URI must start with bolt:// or neo4j://' },
        { status: 400 }
      );
    }

    // Deactivate existing configs
    await prisma.neo4jConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Create new config
    const config = await prisma.neo4jConfig.create({
      data: {
        uri,
        username,
        password,
        database: database || 'neo4j',
        isActive: true,
        schemaInitialized: false,
      },
    });

    // Return config without sensitive data
    const safeConfig = {
      ...config,
      password: '********',
    };

    return NextResponse.json({ config: safeConfig }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating Neo4j config:', error);
    return NextResponse.json(
      { error: 'Failed to create Neo4j configuration', details: error.message },
      { status: 500 }
    );
  }
}
