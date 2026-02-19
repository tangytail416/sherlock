import { NextRequest, NextResponse } from 'next/server';
import { getEntityFindings } from '@/lib/memory/graph-memory';
import { NodeLabel } from '@/lib/neo4j/schema';

// POST /api/memory/entity-history - Get entity timeline and history
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityType, entityValue } = body;

    if (!entityType || !entityValue) {
      return NextResponse.json(
        { error: 'Entity type and value are required' },
        { status: 400 }
      );
    }

    // Validate entity type
    const validTypes = ['User', 'IPAddress', 'Host', 'Service'];
    if (!validTypes.includes(entityType)) {
      return NextResponse.json(
        { error: `Invalid entity type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const timeline = await getEntityFindings(
      NodeLabel[entityType as keyof typeof NodeLabel],
      entityValue
    );

    return NextResponse.json({
      entity: { type: entityType, value: entityValue },
      findingsCount: timeline.length,
      findings: timeline,
    });
  } catch (error: any) {
    console.error('Error getting entity history:', error);
    return NextResponse.json(
      { error: 'Failed to get entity history', details: error.message },
      { status: 500 }
    );
  }
}
