import { executeCypher, executeWriteTransaction, toNumber } from '@/lib/neo4j/client';
import { NodeLabel, RelationshipType } from '@/lib/neo4j/schema';
import { prisma } from '@/lib/db';

/**
 * Normalize entity value based on type
 * Prevents duplicates from case/whitespace differences
 */
function normalizeEntityValue(type: NodeLabel, value: string): string {
  const trimmed = value.trim();
  
  switch (type) {
    case NodeLabel.Domain:
      return trimmed.toLowerCase();
    case NodeLabel.IPAddress:
      return trimmed.toLowerCase();
    case NodeLabel.User:
      return trimmed.toLowerCase();
    default:
      return trimmed;
  }
}

/**
 * Interface for an entity involved in a finding or relationship
 */
export interface GraphEntity {
  type: NodeLabel;
  value: string;
}

/**
 * Interface for a relationship to be created in the graph
 */
export interface GraphRelationship {
  source: GraphEntity;
  target: GraphEntity;
  type: RelationshipType;
  description?: string;
}

/**
 * Add a finding and its associated entities and relationships to the graph
 */
export async function addFindingToGraph(
  findingId: string,
  originalId: string,
  summary: string,
  severity: string,
  source: string,
  relationships: GraphRelationship[] = [],
  involvedEntities: { type: NodeLabel; value: string }[] = []
): Promise<void> {
  try {
    await executeWriteTransaction(async (tx) => {
      // 1. Create Finding Node
      await tx.run(
        `
        MERGE (f:${NodeLabel.Finding} {id: $findingId})
        SET f.originalId = $originalId,
            f.summary = $summary,
            f.severity = $severity,
            f.source = $source,
            f.timestamp = datetime(),
            f.updatedAt = datetime()
        `,
        {
          findingId,
          originalId,
          summary: summary.substring(0, 500),
          severity,
          source,
        }
      );

      // 2. Process Relationships
      for (const rel of relationships) {
        const normalizedSourceValue = normalizeEntityValue(rel.source.type, rel.source.value);
        const normalizedTargetValue = normalizeEntityValue(rel.target.type, rel.target.value);

        // Ensure Source Node exists
        await tx.run(
          `
          MERGE (s:${rel.source.type} {value: $value})
          ON CREATE SET s.type = $type, 
                        s.firstSeen = datetime(),
                        s.lastSeen = datetime()
          ON MATCH SET s.lastSeen = datetime()
          `,
          { value: normalizedSourceValue, type: rel.source.type }
        );

        // Ensure Target Node exists
        await tx.run(
          `
          MERGE (t:${rel.target.type} {value: $value})
          ON CREATE SET t.type = $type,
                        t.firstSeen = datetime(),
                        t.lastSeen = datetime()
          ON MATCH SET t.lastSeen = datetime()
          `,
          { value: normalizedTargetValue, type: rel.target.type }
        );

        // Create Entity-to-Entity Relationship
        await tx.run(
          `
          MATCH (s:${rel.source.type} {value: $sourceValue})
          MATCH (t:${rel.target.type} {value: $targetValue})
          MERGE (s)-[r:${rel.type}]->(t)
          SET r.lastSeen = datetime(),
              r.description = $description
          `,
          {
            sourceValue: normalizedSourceValue,
            targetValue: normalizedTargetValue,
            description: rel.description || '',
          }
        );

        // 3. Link Finding to Entities (Attribution)
        // Link Finding -> Source Entity
        await tx.run(
          `
          MATCH (f:${NodeLabel.Finding} {id: $findingId})
          MATCH (e:${rel.source.type} {value: $value})
          MERGE (f)-[:${RelationshipType.IDENTIFIED}]->(e)
          `,
          { findingId, value: normalizedSourceValue }
        );

        // Link Finding -> Target Entity
        await tx.run(
          `
          MATCH (f:${NodeLabel.Finding} {id: $findingId})
          MATCH (e:${rel.target.type} {value: $value})
          MERGE (f)-[:${RelationshipType.IDENTIFIED}]->(e)
          `,
          { findingId, value: normalizedTargetValue }
        );
      }

      // 4. Process Involved Entities (that might not have relationships yet)
      for (const entity of involvedEntities) {
        const normalizedValue = normalizeEntityValue(entity.type, entity.value);
        
        // Ensure Entity Node exists
        await tx.run(
          `
          MERGE (e:${entity.type} {value: $value})
          ON CREATE SET e.type = $type, 
                        e.firstSeen = datetime(),
                        e.lastSeen = datetime()
          ON MATCH SET e.lastSeen = datetime()
          `,
          { value: normalizedValue, type: entity.type }
        );

        // Link Finding -> Entity
        await tx.run(
          `
          MATCH (f:${NodeLabel.Finding} {id: $findingId})
          MATCH (e:${entity.type} {value: $value})
          MERGE (f)-[:${RelationshipType.IDENTIFIED}]->(e)
          `,
          { findingId, value: normalizedValue }
        );
      }

      return { records: [], summary: {} as any };
    });

    console.log(`Added finding ${findingId} to graph with ${relationships.length} relationships`);
  } catch (error) {
    console.error('Error adding finding to graph:', error);
    throw error;
  }
}

/**
 * Get context for an entity (neighbors and relationships)
 * Useful for investigation kick-off
 */
export async function getEntityContext(
  type: NodeLabel,
  value: string,
  depth: number = 1
): Promise<any[]> {
  try {
    const result = await executeCypher(
      `
      MATCH (e:${type} {value: $value})-[r]-(n)
      WHERE NOT n:${NodeLabel.Finding} // Exclude findings to focus on entity graph
      RETURN type(r) as relationship, 
             labels(n)[0] as neighborType, 
             n.value as neighborValue,
             r.lastSeen as lastSeen
      LIMIT 50
      `,
      { value }
    );

    return result;
  } catch (error) {
    console.error('Error getting entity context:', error);
    return [];
  }
}

/**
 * Find path between two entities (Lateral Movement analysis)
 */
export async function findPath(
  sourceType: NodeLabel,
  sourceValue: string,
  targetType: NodeLabel,
  targetValue: string,
  maxDepth: number = 5
): Promise<any> {
  try {
    const result = await executeCypher(
      `
      MATCH path = shortestPath((s:${sourceType} {value: $sourceValue})-[*..${maxDepth}]-(t:${targetType} {value: $targetValue}))
      RETURN path
      `,
      { sourceValue, targetValue }
    );

    return result[0]?.path || null;
  } catch (error) {
    console.error('Error finding path:', error);
    return null;
  }
}

/**
 * Get recent findings for an entity
 */
export async function getEntityFindings(
  type: NodeLabel,
  value: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const result = await executeCypher(
      `
      MATCH (e:${type} {value: $value})<-[:${RelationshipType.IDENTIFIED}]-(f:${NodeLabel.Finding})
      RETURN f.summary as summary,
             f.severity as severity,
             f.timestamp as timestamp,
             f.originalId as originalId
      ORDER BY f.timestamp DESC
      LIMIT $limit
      `,
      { value, limit }
    );

    return result;
  } catch (error) {
    console.error('Error getting entity findings:', error);
    return [];
  }
}

/**
 * Extract entities from text or object data
 * Used to identify potential entities in alerts or logs
 */
export function extractEntities(text: string, data?: any): { type: NodeLabel; value: string }[] {
  const entities: { type: NodeLabel; value: string }[] = [];
  const seen = new Set<string>();

  function addEntity(type: NodeLabel, value: string) {
    if (!value || typeof value !== 'string') return;
    const normalizedValue = normalizeEntityValue(type, value);
    if (normalizedValue && !seen.has(`${type}:${normalizedValue}`)) {
      entities.push({ type, value: normalizedValue });
      seen.add(`${type}:${normalizedValue}`);
    }
  }

  // 1. Extract from structured data if provided
  if (data) {
    // Recursively search for known keys
    function searchKeys(obj: any) {
      if (!obj || typeof obj !== 'object') return;

      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string') {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('ip') || lowerKey.includes('address')) addEntity(NodeLabel.IPAddress, val);
          else if (lowerKey.includes('user') || lowerKey.includes('login')) addEntity(NodeLabel.User, val);
          else if (lowerKey.includes('host') || lowerKey.includes('computer')) addEntity(NodeLabel.Host, val);
          else if (lowerKey.includes('file') || lowerKey.includes('path')) addEntity(NodeLabel.File, val);
          else if (lowerKey.includes('process') || lowerKey.includes('command')) addEntity(NodeLabel.Process, val);
          else if (lowerKey.includes('domain') || lowerKey.includes('url')) addEntity(NodeLabel.Domain, val);
        } else if (typeof val === 'object') {
          searchKeys(val);
        }
      }
    }
    searchKeys(data);
  }

  // 2. Extract from text using Regex
  // IPv4
  const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  const ips = text.match(ipRegex) || [];
  ips.forEach(ip => addEntity(NodeLabel.IPAddress, ip));

  // Email/User (simple)
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex) || [];
  emails.forEach(email => addEntity(NodeLabel.User, email));

  // Domain (simple)
  const domainRegex = /\b((?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,6}\b/g;
  const domains = text.match(domainRegex) || [];
  domains.forEach(domain => {
    if (!(ips as string[]).includes(domain)) { // Avoid matching IPs as domains
      addEntity(NodeLabel.Domain, domain);
    }
  });

  return entities;
}

/**
 * Find findings related to a set of entities
 * Used to discover historical context
 */
export async function findRelatedFindings(
  entities: { type: NodeLabel; value: string }[]
): Promise<any[]> {
  if (entities.length === 0) return [];

  try {
    // Construct WHERE clause dynamically
    const conditions = entities.map(
      (e, i) => `(e.type = $type${i} AND e.value = $value${i})`
    ).join(' OR ');

    const params: any = {};
    entities.forEach((e, i) => {
      params[`type${i}`] = e.type;
      params[`value${i}`] = e.value;
    });

    const result = await executeCypher(
      `
      MATCH (f:${NodeLabel.Finding})-[r:${RelationshipType.IDENTIFIED}]->(e:${NodeLabel.Entity})
      WHERE ${conditions}
      RETURN DISTINCT f.id as id, 
                      f.originalId as originalId,
                      f.summary as summary, 
                      f.severity as severity, 
                      f.timestamp as timestamp,
                      e.type as entityType,
                      e.value as entityValue
      ORDER BY f.timestamp DESC
      LIMIT 20
      `,
      params
    );

    return result;
  } catch (error) {
    console.error('Error finding related findings:', error);
    return [];
  }
}

/**
 * Generate Neo4j entity extraction instructions to append to agent prompts
 * Returns empty string if Neo4j is disabled
 */
export function getNeo4jExtractionInstructions(): string {
  const neo4jEnabled = process.env.NEO4J_ENABLED !== 'false'; // Default to true
  
  if (!neo4jEnabled) {
    return '';
  }

  return `

╔══════════════════════════════════════════════════════════════════════════════╗
║         REQUIRED: ENTITY & RELATIONSHIP EXTRACTION (Neo4j Integration)       ║
╚══════════════════════════════════════════════════════════════════════════════╝

⚠️  IMPORTANT: Your output MUST include both "notable_entities" and "notable_relationships"
    fields in the final JSON response. These fields are REQUIRED and cannot be omitted.

═══════════════════════════════════════════════════════════════════════════════

NOTABLE ENTITIES - REQUIRED FIELD
----------------------------------
Identify ALL entities directly involved in this security incident.

Your response MUST include this field:
{
  "notable_entities": [
    {
      "type": "User|IPAddress|Host|Process|File|Domain|Resource",
      "value": "entity_value",
      "significance": "why this entity is notable in the context of this incident"
    }
  ]
}

Example (Authentication Investigation):
{
  "notable_entities": [
    {"type": "User", "value": "alice.smith", "significance": "Compromised account - authenticated from TOR exit node"},
    {"type": "IPAddress", "value": "185.220.101.34", "significance": "Known TOR exit node - source of malicious authentication"},
    {"type": "Host", "value": "workstation-042", "significance": "Target system for initial access attempt"}
  ]
}

═══════════════════════════════════════════════════════════════════════════════

NOTABLE RELATIONSHIPS - REQUIRED FIELD
---------------------------------------
Identify connections between entities that show attack progression.

Your response MUST include this field:
{
  "notable_relationships": [
    {
      "source": {"type": "User", "value": "alice.smith"},
      "target": {"type": "IPAddress", "value": "185.220.101.34"},
      "relationship": "AUTHENTICATED_FROM",
      "significance": "Initial compromise vector - TOR-based authentication"
    }
  ]
}

Example (Complete relationship chain):
{
  "notable_relationships": [
    {
      "source": {"type": "User", "value": "alice.smith"},
      "target": {"type": "IPAddress", "value": "185.220.101.34"},
      "relationship": "AUTHENTICATED_FROM",
      "significance": "Initial compromise - authentication from suspicious IP"
    },
    {
      "source": {"type": "User", "value": "alice.smith"},
      "target": {"type": "Host", "value": "prod-db-01"},
      "relationship": "ACCESSED_RESOURCE",
      "significance": "Lateral movement - unusual database access from marketing user"
    },
    {
      "source": {"type": "Host", "value": "prod-db-01"},
      "target": {"type": "IPAddress", "value": "203.0.113.45"},
      "relationship": "CONNECTED_TO",
      "significance": "Data exfiltration - outbound connection to external IP"
    }
  ]
}

Recommended relationship types:
┌─────────────────────────┬──────────────────────────────────────────────┐
│ AUTHENTICATED_FROM      │ User authenticated from IP/Host              │
│ LOGGED_ON               │ User logged into system                      │
│ COMMUNICATED_WITH       │ Network communication between entities       │
│ CONNECTED_TO            │ Network connection established               │
│ SPAWNED                 │ Process creation relationship                │
│ OWNS_PROCESS            │ User owns/started process                    │
│ RUNNING_ON              │ Process running on host                      │
│ ACCESSED_RESOURCE       │ Access to files/databases/services           │
│ CREATED_FILE            │ File creation                                │
│ MODIFIED_FILE           │ File modification                            │
│ EXECUTED_COMMAND        │ Command execution                            │
│ TRANSFERRED_DATA        │ Data transfer/exfiltration                   │
└─────────────────────────┴──────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════

INCLUSION CRITERIA:
✓ Anomalous or suspicious entities/relationships
✓ Part of the attack chain or kill chain
✓ Relevant to understanding incident scope and impact
✓ Useful for correlation with past or future incidents
✓ Shows lateral movement, privilege escalation, or data exfiltration

EXCLUSION CRITERIA:
✗ Routine/benign entities (unless they provide critical context)
✗ Unrelated background noise
✗ System processes not involved in the incident

If no suspicious relationships are found, return empty arrays, but the fields MUST be present:
{
  "notable_entities": [],
  "notable_relationships": []
}

═══════════════════════════════════════════════════════════════════════════════
`;
}

/**
 * Get comprehensive graph context for an investigation
 * Returns all entities, relationships, and related findings
 */
export async function getInvestigationGraphContext(investigationId: string): Promise<{
  entities: any[];
  relationships: any[];
  relatedFindings: any[];
  entityCounts: Record<string, number>;
}> {
  try {
    // Get all findings for this investigation
    const findings = await executeCypher(
      `
      MATCH (f:${NodeLabel.Finding} {originalId: $investigationId})
      RETURN f.id as findingId, f.source as agentName, f.summary as summary
      `,
      { investigationId }
    );

    if (findings.length === 0) {
      return { entities: [], relationships: [], relatedFindings: [], entityCounts: {} };
    }

    const findingIds = findings.map((f: any) => f.findingId);

    // Get all entities identified by these findings
    const entities = await executeCypher(
      `
      MATCH (f:${NodeLabel.Finding})-[:${RelationshipType.IDENTIFIED}]->(e)
      WHERE f.id IN $findingIds
      RETURN DISTINCT labels(e)[0] as entityType, 
                      e.value as entityValue,
                      e.firstSeen as firstSeen,
                      e.lastSeen as lastSeen
      `,
      { findingIds }
    );

    // Get all relationships between entities
    const relationships = await executeCypher(
      `
      MATCH (f:${NodeLabel.Finding})-[:${RelationshipType.IDENTIFIED}]->(e1)
      WHERE f.id IN $findingIds
      WITH COLLECT(DISTINCT e1) as investigationEntities
      UNWIND investigationEntities as e1
      UNWIND investigationEntities as e2
      MATCH (e1)-[r]->(e2)
      WHERE e1 <> e2
      RETURN DISTINCT labels(e1)[0] as sourceType,
                      e1.value as sourceValue,
                      type(r) as relationshipType,
                      labels(e2)[0] as targetType,
                      e2.value as targetValue,
                      r.description as description,
                      r.lastSeen as lastSeen
      `,
      { findingIds }
    );

    // Get related findings (entities that appear in other investigations)
    const entityValues = entities.map((e: any) => ({ type: e.entityType, value: e.entityValue }));
    const relatedFindings = await findRelatedFindings(entityValues);

    // Count entities by type
    const entityCounts: Record<string, number> = {};
    entities.forEach((e: any) => {
      entityCounts[e.entityType] = (entityCounts[e.entityType] || 0) + 1;
    });

    return {
      entities,
      relationships,
      relatedFindings,
      entityCounts,
    };
  } catch (error) {
    console.error('Error getting investigation graph context:', error);
    return { entities: [], relationships: [], relatedFindings: [], entityCounts: {} };
  }
}

/**
 * Find lateral movement paths in the investigation graph
 * Identifies chains of user -> host -> user -> host connections
 */
export async function findLateralMovementPaths(investigationId: string): Promise<any[]> {
  try {
    const result = await executeCypher(
      `
      MATCH (f:${NodeLabel.Finding} {originalId: $investigationId})-[:${RelationshipType.IDENTIFIED}]->(startUser:${NodeLabel.User})
      MATCH path = (startUser)-[:${RelationshipType.LOGGED_ON}|${RelationshipType.AUTHENTICATED_FROM}*1..5]->(target)
      WHERE target:${NodeLabel.Host} OR target:${NodeLabel.IPAddress}
      WITH path, length(path) as pathLength
      WHERE pathLength >= 2
      RETURN path, pathLength
      ORDER BY pathLength DESC
      LIMIT 10
      `,
      { investigationId }
    );

    return result;
  } catch (error) {
    console.error('Error finding lateral movement paths:', error);
    return [];
  }
}

/**
 * Get timeline of entity appearances across findings
 * Useful for "when was this user/IP first seen" analysis
 */
export async function getEntityTimeline(
  entityType: NodeLabel,
  entityValue: string
): Promise<any[]> {
  try {
    const result = await executeCypher(
      `
      MATCH (e:${entityType} {value: $value})<-[:${RelationshipType.IDENTIFIED}]-(f:${NodeLabel.Finding})
      RETURN f.timestamp as timestamp,
             f.summary as findingSummary,
             f.source as source,
             f.originalId as investigationId,
             f.severity as severity
      ORDER BY f.timestamp ASC
      `,
      { value: entityValue }
    );

    return result;
  } catch (error) {
    console.error('Error getting entity timeline:', error);
    return [];
  }
}
