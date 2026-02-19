import { NextRequest, NextResponse } from 'next/server';
import { testNeo4jConnection } from '@/lib/neo4j/client';
import { prisma } from '@/lib/db';

// POST /api/neo4j-config/test - Test Neo4j connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uri, username, password, database } = body;

    // If credentials provided in request, test with those
    let testConfig;
    if (uri && username && password) {
      testConfig = { uri, username, password, database: database || 'neo4j' };
    }

    // Test the connection
    const result = await testNeo4jConnection(testConfig);

    // If successful and using provided credentials, update lastTestedAt
    if (result.success && testConfig) {
      const existingConfig = await prisma.neo4jConfig.findFirst({
        where: { isActive: true },
      });

      if (existingConfig) {
        await prisma.neo4jConfig.update({
          where: { id: existingConfig.id },
          data: { lastTestedAt: new Date() },
        });
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error testing Neo4j connection:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Connection test failed',
        details: { error: error.message },
      },
      { status: 500 }
    );
  }
}
