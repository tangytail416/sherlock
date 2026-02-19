import { NextResponse } from 'next/server';
import { initializeGraphSchema } from '@/lib/neo4j/schema';
import { getGraphStatistics } from '@/lib/neo4j/client';
import { prisma } from '@/lib/db';

// POST /api/neo4j-config/initialize-schema - Initialize Neo4j graph schema
export async function POST() {
  try {
    console.log('[API] Initializing Neo4j graph schema...');

    // Initialize constraints and indexes
    const result = await initializeGraphSchema();

    // Get graph statistics
    let stats;
    try {
      stats = await getGraphStatistics();

      // Update Neo4jConfig with stats
      const config = await prisma.neo4jConfig.findFirst({
        where: { isActive: true },
      });

      if (config) {
        await prisma.neo4jConfig.update({
          where: { id: config.id },
          data: {
            nodeCount: stats.nodeCount,
            relationshipCount: stats.relationshipCount,
            lastStatsUpdate: new Date(),
          },
        });
      }
    } catch (error) {
      console.warn('[API] Could not fetch graph statistics:', error);
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      details: result.details,
      statistics: stats,
    });
  } catch (error: any) {
    console.error('[API] Error initializing graph schema:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to initialize graph schema',
        details: { error: error.message },
      },
      { status: 500 }
    );
  }
}

// GET /api/neo4j-config/initialize-schema - Get schema status
export async function GET() {
  try {
    const config = await prisma.neo4jConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return NextResponse.json({
        initialized: false,
        message: 'No active Neo4j configuration found',
      });
    }

    // Get fresh statistics
    try {
      const stats = await getGraphStatistics();

      // Update config with latest stats
      await prisma.neo4jConfig.update({
        where: { id: config.id },
        data: {
          nodeCount: stats.nodeCount,
          relationshipCount: stats.relationshipCount,
          lastStatsUpdate: new Date(),
        },
      });

      return NextResponse.json({
        initialized: config.schemaInitialized,
        statistics: stats,
        lastUpdate: new Date(),
      });
    } catch (error) {
      return NextResponse.json({
        initialized: config.schemaInitialized,
        statistics: {
          nodeCount: config.nodeCount || 0,
          relationshipCount: config.relationshipCount || 0,
        },
        lastUpdate: config.lastStatsUpdate,
      });
    }
  } catch (error: any) {
    console.error('[API] Error getting schema status:', error);
    return NextResponse.json(
      { error: 'Failed to get schema status', details: error.message },
      { status: 500 }
    );
  }
}
