import neo4j, { Driver, Session, Result, QueryResult } from 'neo4j-driver';
import { prisma } from '@/lib/db';

let driver: Driver | null = null;
let schemaCheckLogged = false;

export interface Neo4jConnectionConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

/**
 * Initialize the Neo4j driver with connection configuration
 */
export async function initializeNeo4jDriver(config?: Neo4jConnectionConfig): Promise<Driver> {
  try {
    // If config not provided, fetch from database
    if (!config) {
      const dbConfig = await getActiveNeo4jConfig();
      if (!dbConfig) {
        throw new Error('No active Neo4j configuration found');
      }
      config = {
        uri: dbConfig.uri,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database,
      };
    }

    // Close existing driver if any
    if (driver) {
      await driver.close();
    }

    // Create new driver instance
    driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password),
      {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
      }
    );

    // Verify connectivity
    await driver.verifyConnectivity();

    console.log('Neo4j driver initialized successfully');
    return driver;
  } catch (error) {
    console.error('Failed to initialize Neo4j driver:', error);
    throw error;
  }
}

/**
 * Check if Neo4j schema has been initialized
 * Returns true if constraints/indexes exist or config says initialized
 */
export async function isSchemaReady(): Promise<boolean> {
  try {
    const config = await prisma.neo4jConfig.findFirst({
      where: { isActive: true },
    });

    if (config?.schemaInitialized) {
      return true;
    }

    const constraints = await executeCypher('SHOW CONSTRAINTS');
    return constraints.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get the active Neo4j driver instance, initializing if needed
 */
export async function getNeo4jDriver(): Promise<Driver> {
  if (!driver) {
    await initializeNeo4jDriver();
  }
  
  if (!schemaCheckLogged) {
    isSchemaReady().then((ready) => {
      if (!ready) {
        console.warn(
          '\n' + '⚠️ '.repeat(35) +
          '\n⚠️  Neo4j schema not initialized!' +
          '\n⚠️  Run: npx ts-node scripts/init-neo4j-schema.ts' +
          '\n⚠️  Or reset: npx ts-node scripts/reset-neo4j.ts --force' +
          '\n⚠️  Data integrity issues may occur without proper constraints.' +
          '\n' + '⚠️ '.repeat(35) + '\n'
        );
      }
      schemaCheckLogged = true;
    });
  }
  
  return driver!;
}

/**
 * Get active Neo4j configuration from environment variables or database
 * Priority: Environment Variables > Database Config
 */
export async function getActiveNeo4jConfig() {
  // Priority 1: Environment variables
  const envUri = process.env.NEO4J_URI;
  const envUser = process.env.NEO4J_USER;
  const envPassword = process.env.NEO4J_PASSWORD;

  if (envUri && envUser && envPassword) {
    console.log('[Neo4j] Using configuration from environment variables');
    return {
      uri: envUri,
      username: envUser,
      password: envPassword,
      database: process.env.NEO4J_DATABASE || 'neo4j',
    };
  }

  // Priority 2: Database configuration
  const config = await prisma.neo4jConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (config) {
    console.log('[Neo4j] Using configuration from database');
    return config;
  }

  console.warn('[Neo4j] No configuration found in environment or database');
  return null;
}

/**
 * Execute a Cypher query with parameters
 */
export async function executeCypher<T = any>(
  query: string,
  parameters: Record<string, any> = {},
  database?: string
): Promise<T[]> {
  const driver = await getNeo4jDriver();
  const config = await getActiveNeo4jConfig();
  const session = driver.session({
    database: database || config?.database || 'neo4j',
  });

  try {
    const result = await session.run(query, parameters);
    return result.records.map((record) => record.toObject() as T);
  } catch (error) {
    console.error('Error executing Cypher query:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Execute a write transaction (for create/update/delete operations)
 */
export async function executeWriteTransaction<T = any>(
  queryFn: (tx: any) => Promise<QueryResult>,
  database?: string
): Promise<T[]> {
  const driver = await getNeo4jDriver();
  const config = await getActiveNeo4jConfig();
  const session = driver.session({
    database: database || config?.database || 'neo4j',
  });

  try {
    const result = await session.executeWrite(queryFn);
    // If the callback doesn't return a result (e.g., just runs mutations), return empty array
    if (!result || !result.records) {
      return [];
    }
    return result.records.map((record) => record.toObject() as T);
  } catch (error) {
    console.error('Error executing write transaction:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Execute a read transaction (for read-only operations)
 */
export async function executeReadTransaction<T = any>(
  queryFn: (tx: any) => Promise<QueryResult>,
  database?: string
): Promise<T[]> {
  const driver = await getNeo4jDriver();
  const config = await getActiveNeo4jConfig();
  const session = driver.session({
    database: database || config?.database || 'neo4j',
  });

  try {
    const result = await session.executeRead(queryFn);
    // If the callback doesn't return a result, return empty array
    if (!result || !result.records) {
      return [];
    }
    return result.records.map((record) => record.toObject() as T);
  } catch (error) {
    console.error('Error executing read transaction:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Test Neo4j connection health
 */
export async function testNeo4jConnection(
  config?: Neo4jConnectionConfig
): Promise<{ success: boolean; message: string; details?: any }> {
  let testDriver: Driver | null = null;

  try {
    // Use provided config or get from database/env
    const connectionConfig = config || (await getActiveNeo4jConfig());

    if (!connectionConfig) {
      return {
        success: false,
        message: 'No Neo4j configuration found. Please configure Neo4j connection settings.',
      };
    }

    // Create a test driver
    testDriver = neo4j.driver(
      connectionConfig.uri,
      neo4j.auth.basic(connectionConfig.username, connectionConfig.password)
    );

    // Verify connectivity
    await testDriver.verifyConnectivity();

    // Run a simple query to test database access
    const session = testDriver.session({ database: connectionConfig.database || 'neo4j' });
    try {
      const result = await session.run('RETURN 1 as test');
      const testValue = result.records[0]?.get('test');

      // Convert Neo4j Integer to number if needed
      const numValue = typeof testValue === 'object' && testValue?.toNumber
        ? testValue.toNumber()
        : testValue;

      if (numValue !== 1) {
        throw new Error('Unexpected test query result');
      }

      // Get basic statistics
      const stats = await session.run(`
        MATCH (n)
        RETURN count(n) as nodeCount
      `);
      const nodeCount = stats.records[0]?.get('nodeCount').toNumber() || 0;

      await session.close();

      return {
        success: true,
        message: 'Successfully connected to Neo4j',
        details: {
          uri: connectionConfig.uri,
          database: connectionConfig.database || 'neo4j',
          nodeCount,
        },
      };
    } catch (error: any) {
      await session.close();
      throw error;
    }
  } catch (error: any) {
    console.error('Neo4j connection test failed:', error);

    let message = 'Failed to connect to Neo4j';
    if (error.code === 'ServiceUnavailable') {
      message = 'Neo4j service is unavailable. Please check if Neo4j is running.';
    } else if (error.code === 'Neo.ClientError.Security.Unauthorized') {
      message = 'Authentication failed. Please check username and password.';
    } else if (error.message) {
      message = `Connection error: ${error.message}`;
    }

    return {
      success: false,
      message,
      details: {
        error: error.message,
        code: error.code,
      },
    };
  } finally {
    if (testDriver) {
      await testDriver.close();
    }
  }
}

/**
 * Get graph statistics (node count, relationship count)
 */
export async function getGraphStatistics(): Promise<{
  nodeCount: number;
  relationshipCount: number;
  labelCounts: Record<string, number>;
}> {
  try {
    const driver = await getNeo4jDriver();
    const config = await getActiveNeo4jConfig();
    const session = driver.session({ database: config?.database || 'neo4j' });

    try {
      // Get total node count
      const nodeResult = await session.run('MATCH (n) RETURN count(n) as count');
      const nodeCount = nodeResult.records[0]?.get('count').toNumber() || 0;

      // Get total relationship count
      const relResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
      const relationshipCount = relResult.records[0]?.get('count').toNumber() || 0;

      // Get counts per label
      const labelResult = await session.run(`
        MATCH (n)
        RETURN labels(n)[0] as label, count(n) as count
        ORDER BY count DESC
      `);

      const labelCounts: Record<string, number> = {};
      labelResult.records.forEach((record) => {
        const label = record.get('label');
        const count = record.get('count').toNumber();
        if (label) {
          labelCounts[label] = count;
        }
      });

      return { nodeCount, relationshipCount, labelCounts };
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('Error fetching graph statistics:', error);
    throw error;
  }
}

/**
 * Close the Neo4j driver connection
 */
export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
    console.log('Neo4j driver closed');
  }
}

/**
 * Helper to convert Neo4j Integer to JavaScript number
 */
export function toNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return parseInt(value, 10) || 0;
}

/**
 * Helper to safely get property from Neo4j node
 */
export function getNodeProperty<T = any>(node: any, property: string): T | null {
  try {
    return node.properties[property] ?? null;
  } catch {
    return null;
  }
}
