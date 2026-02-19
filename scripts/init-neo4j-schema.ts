/**
 * Initialize Neo4j Graph Schema
 * Creates constraints and indexes for the memory system
 */

import { initializeGraphSchema } from '../lib/neo4j/schema';
import { testNeo4jConnection, getGraphStatistics } from '../lib/neo4j/client';

async function main() {
  console.log('🚀 Initializing Neo4j Graph Schema...\n');

  // Test connection first
  console.log('1. Testing Neo4j connection...');
  const connectionTest = await testNeo4jConnection();

  if (!connectionTest.success) {
    console.error('❌ Connection failed:', connectionTest.message);
    console.error('   Details:', connectionTest.details);
    process.exit(1);
  }

  console.log('✅ Connected to Neo4j');
  console.log(`   URI: ${connectionTest.details?.uri}`);
  console.log(`   Database: ${connectionTest.details?.database}`);
  console.log(`   Node Count: ${connectionTest.details?.nodeCount || 0}\n`);

  // Initialize schema
  console.log('2. Creating constraints and indexes...');
  const schemaResult = await initializeGraphSchema();

  if (!schemaResult.success) {
    console.error('❌ Schema initialization failed:', schemaResult.message);
    console.error('   Details:', schemaResult.details);
    process.exit(1);
  }

  console.log('✅ Schema initialized successfully');
  console.log(`   Constraints created: ${schemaResult.details?.constraintsCreated || 0}`);
  console.log(`   Constraints existing: ${schemaResult.details?.constraintsExisting || 0}`);
  console.log(`   Indexes created: ${schemaResult.details?.indexesCreated || 0}`);
  console.log(`   Indexes existing: ${schemaResult.details?.indexesExisting || 0}\n`);

  // Get final statistics
  console.log('3. Fetching graph statistics...');
  const stats = await getGraphStatistics();
  console.log('✅ Graph statistics:');
  console.log(`   Total nodes: ${stats.nodeCount}`);
  console.log(`   Total relationships: ${stats.relationshipCount}`);

  if (Object.keys(stats.labelCounts).length > 0) {
    console.log('   Node types:');
    for (const [label, count] of Object.entries(stats.labelCounts)) {
      console.log(`     - ${label}: ${count}`);
    }
  }

  console.log('\n🎉 Neo4j graph schema initialization complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  });
