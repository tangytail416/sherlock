import { executeCypher, toNumber } from './client';
import { prisma } from '@/lib/db';

/**
 * Node labels in the graph database
 */
export enum NodeLabel {
  // Base Entity Label
  Entity = 'Entity',

  // Specific Entity Types
  User = 'User',
  IPAddress = 'IPAddress',
  Host = 'Host',
  Service = 'Service',
  File = 'File',
  Domain = 'Domain',
  Resource = 'Resource',
  Policy = 'Policy',
  Process = 'Process',
  Port = 'Port',

  // Artifacts
  Finding = 'Finding',
  Technique = 'Technique', // MITRE ATT&CK
  IOC = 'IOC',
}

/**
 * Relationship types in the graph database
 */
export enum RelationshipType {
  // Identity & Access
  LOGGED_ON = 'LOGGED_ON',
  FAILED_LOGIN = 'FAILED_LOGIN',
  AUTHENTICATED_FROM = 'AUTHENTICATED_FROM',
  ELEVATED_PRIVILEGES_ON = 'ELEVATED_PRIVILEGES_ON',
  ADDED_USER = 'ADDED_USER',
  OWNS_PROCESS = 'OWNS_PROCESS',

  // Process & Execution
  SPAWNED = 'SPAWNED',
  INJECTED_INTO = 'INJECTED_INTO',
  LOADED_MODULE = 'LOADED_MODULE',
  EXECUTED_COMMAND = 'EXECUTED_COMMAND',
  RUNNING_ON = 'RUNNING_ON',

  // Network & Infrastructure
  ASSIGNED_TO = 'ASSIGNED_TO',
  COMMUNICATED_WITH = 'COMMUNICATED_WITH',
  INITIATED_CONNECTION = 'INITIATED_CONNECTION',
  LISTENS_ON = 'LISTENS_ON',
  RESOLVED = 'RESOLVED',
  RESOLVES_TO = 'RESOLVES_TO',
  CONNECTED_TO = 'CONNECTED_TO',

  // File System
  FOUND_ON = 'FOUND_ON',
  CREATED_FILE = 'CREATED_FILE',
  MODIFIED_FILE = 'MODIFIED_FILE',
  DELETED_FILE = 'DELETED_FILE',
  READ_FILE = 'READ_FILE',
  HAS_HASH = 'HAS_HASH',
  LOCATED_AT = 'LOCATED_AT', // File -> Path
  ACCESSED_FILE = 'ACCESSED_FILE', // Process -> File

  // Cloud & Resources
  ACCESSED_RESOURCE = 'ACCESSED_RESOURCE',
  MODIFIED_POLICY = 'MODIFIED_POLICY',

  // Attribution / Evidence
  IDENTIFIED = 'IDENTIFIED', // Finding -> Entity
  DETECTED_TECHNIQUE = 'DETECTED_TECHNIQUE', // Finding -> Technique
}

/**
 * Graph schema constraints for uniqueness
 */
const CONSTRAINTS = [
  // Finding uniqueness
  {
    label: NodeLabel.Finding,
    property: 'id',
    type: 'UNIQUE',
  },
  // Technique uniqueness
  {
    label: NodeLabel.Technique,
    property: 'mitreId',
    type: 'UNIQUE',
  },
  // IOC uniqueness
  {
    label: NodeLabel.IOC,
    property: 'value',
    type: 'UNIQUE',
  },
  // Entity uniqueness (composite key strategy: type + value)
  // Note: In Neo4j Community, we can't easily do composite constraints.
  // We will rely on unique constraints per label on the 'value' property for simplicity,
  // assuming 'value' is unique enough within a label (e.g. IP is unique among IPs).
  {
    label: NodeLabel.User,
    property: 'value',
    type: 'UNIQUE',
  },
  {
    label: NodeLabel.IPAddress,
    property: 'value',
    type: 'UNIQUE',
  },
  {
    label: NodeLabel.Host,
    property: 'value',
    type: 'UNIQUE',
  },
  {
    label: NodeLabel.Service,
    property: 'value',
    type: 'UNIQUE',
  },
  {
    label: NodeLabel.File,
    property: 'value', // e.g. filename or full path
    type: 'UNIQUE',
  },
  {
    label: NodeLabel.Domain,
    property: 'value',
    type: 'UNIQUE',
  },
  {
    label: NodeLabel.Process,
    property: 'value', // e.g. PID or Name+PID
    type: 'UNIQUE',
  },
];

/**
 * Graph schema indexes for performance
 */
const INDEXES = [
  // Finding properties
  { label: NodeLabel.Finding, property: 'timestamp' },
  { label: NodeLabel.Finding, property: 'severity' },
  { label: NodeLabel.Finding, property: 'originalId' },

  // Entity properties
  { label: NodeLabel.Entity, property: 'type' },
  { label: NodeLabel.Entity, property: 'lastSeen' },

  // Specific Entity Indexes
  { label: NodeLabel.User, property: 'lastSeen' },
  { label: NodeLabel.IPAddress, property: 'lastSeen' },
  { label: NodeLabel.Host, property: 'lastSeen' },
];

/**
 * Initialize the Neo4j graph schema with constraints and indexes
 */
export async function initializeGraphSchema(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    console.log('Initializing Neo4j graph schema...');

    const results = {
      constraintsCreated: 0,
      constraintsExisting: 0,
      indexesCreated: 0,
      indexesExisting: 0,
      errors: [] as string[],
    };

    // Create constraints
    for (const constraint of CONSTRAINTS) {
      try {
        const constraintName = `${constraint.label.toLowerCase()}_${constraint.property}_unique`;
        const query = `
          CREATE CONSTRAINT ${constraintName} IF NOT EXISTS
          FOR (n:${constraint.label})
          REQUIRE n.${constraint.property} IS UNIQUE
        `;

        await executeCypher(query);
        results.constraintsCreated++;
        console.log(`✓ Created constraint: ${constraintName}`);
      } catch (error: any) {
        if (error.code === 'Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists') {
          results.constraintsExisting++;
        } else {
          results.errors.push(`Constraint ${constraint.label}.${constraint.property}: ${error.message}`);
          console.error(`✗ Failed to create constraint ${constraint.label}.${constraint.property}:`, error);
        }
      }
    }

    // Create indexes
    for (const index of INDEXES) {
      try {
        const indexName = `${index.label.toLowerCase()}_${index.property}_idx`;
        const query = `
          CREATE INDEX ${indexName} IF NOT EXISTS
          FOR (n:${index.label})
          ON (n.${index.property})
        `;

        await executeCypher(query);
        results.indexesCreated++;
        console.log(`✓ Created index: ${indexName}`);
      } catch (error: any) {
        if (error.code === 'Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists') {
          results.indexesExisting++;
        } else {
          results.errors.push(`Index ${index.label}.${index.property}: ${error.message}`);
          console.error(`✗ Failed to create index ${index.label}.${index.property}:`, error);
        }
      }
    }

    // Update Neo4jConfig to mark schema as initialized
    const config = await prisma.neo4jConfig.findFirst({
      where: { isActive: true },
    });

    if (config) {
      await prisma.neo4jConfig.update({
        where: { id: config.id },
        data: { schemaInitialized: true },
      });
    }

    console.log('Graph schema initialization completed');
    console.log(`  Constraints: ${results.constraintsCreated} created, ${results.constraintsExisting} existing`);
    console.log(`  Indexes: ${results.indexesCreated} created, ${results.indexesExisting} existing`);

    if (results.errors.length > 0) {
      console.warn(`  Errors: ${results.errors.length}`);
    }

    return {
      success: results.errors.length === 0,
      message:
        results.errors.length === 0
          ? 'Graph schema initialized successfully'
          : 'Graph schema partially initialized with some errors',
      details: results,
    };
  } catch (error: any) {
    console.error('Failed to initialize graph schema:', error);
    return {
      success: false,
      message: `Failed to initialize graph schema: ${error.message}`,
      details: { error: error.message },
    };
  }
}

/**
 * Check if graph schema is initialized
 */
export async function isSchemaInitialized(): Promise<boolean> {
  try {
    const config = await prisma.neo4jConfig.findFirst({
      where: { isActive: true },
    });

    return config?.schemaInitialized || false;
  } catch (error) {
    console.error('Error checking schema initialization status:', error);
    return false;
  }
}

/**
 * Get current graph schema information
 */
export async function getSchemaInfo(): Promise<{
  constraints: any[];
  indexes: any[];
}> {
  try {
    // Get all constraints
    const constraints = await executeCypher('SHOW CONSTRAINTS');

    // Get all indexes
    const indexes = await executeCypher('SHOW INDEXES');

    return {
      constraints,
      indexes,
    };
  } catch (error) {
    console.error('Error fetching schema info:', error);
    throw error;
  }
}

/**
 * Drop all constraints and indexes (use with caution!)
 */
export async function dropSchema(): Promise<void> {
  try {
    console.log('Dropping all constraints and indexes...');

    // Drop all constraints
    const constraints = await executeCypher('SHOW CONSTRAINTS');
    for (const constraint of constraints) {
      const name = (constraint as any).name;
      await executeCypher(`DROP CONSTRAINT ${name} IF EXISTS`);
      console.log(`Dropped constraint: ${name}`);
    }

    // Drop all indexes
    const indexes = await executeCypher('SHOW INDEXES');
    for (const index of indexes) {
      const name = (index as any).name;
      // Skip built-in indexes
      if (!name.startsWith('__')) {
        await executeCypher(`DROP INDEX ${name} IF EXISTS`);
        console.log(`Dropped index: ${name}`);
      }
    }

    // Update Neo4jConfig
    const config = await prisma.neo4jConfig.findFirst({
      where: { isActive: true },
    });

    if (config) {
      await prisma.neo4jConfig.update({
        where: { id: config.id },
        data: { schemaInitialized: false },
      });
    }

    console.log('Schema dropped successfully');
  } catch (error) {
    console.error('Error dropping schema:', error);
    throw error;
  }
}

/**
 * Clear all data from the graph (use with caution!)
 */
export async function clearGraphData(): Promise<void> {
  try {
    console.log('Clearing all graph data...');

    // Delete all nodes and relationships in batches
    let deletedCount = 0;
    let batchSize = 10000;

    while (true) {
      const result = await executeCypher(`
        MATCH (n)
        WITH n LIMIT ${batchSize}
        DETACH DELETE n
        RETURN count(n) as deleted
      `);

      const deleted = toNumber(result[0]?.deleted || 0);
      deletedCount += deleted;

      if (deleted < batchSize) {
        break;
      }
    }

    console.log(`Cleared ${deletedCount} nodes and their relationships`);
  } catch (error) {
    console.error('Error clearing graph data:', error);
    throw error;
  }
}
