/**
 * Reset Neo4j Graph Database
 * Drops all constraints/indexes, clears all data, reinitializes schema
 * Use for development/testing only - THIS DELETES ALL GRAPH DATA
 * 
 * Run with: npm run neo4j:reset
 * Or: npx tsx scripts/reset-neo4j.ts --force
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Try loading env files in order of priority
function loadEnvFiles() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const envPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath });
      if (result.parsed && Object.keys(result.parsed).length > 0) {
        console.log(`[env] Loaded ${Object.keys(result.parsed).length} variables from ${file}`);
        return;
      }
    }
  }
  // If no env files found, assume env vars are already set
  if (process.env.DATABASE_URL) {
    console.log('[env] Using environment variables from process');
  } else {
    console.warn('[env] No .env files found and DATABASE_URL not set');
  }
}

loadEnvFiles();

import {
  dropSchema,
  clearGraphData,
  initializeGraphSchema,
  isSchemaInitialized,
} from '../lib/neo4j/schema';
import { testNeo4jConnection, getGraphStatistics } from '../lib/neo4j/client';
import { prisma } from '../lib/db';

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('⚠️  NEO4J GRAPH DATABASE RESET');
  console.log('   This will DELETE ALL graph data and recreate the schema');
  console.log('='.repeat(70) + '\n');

  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');

  if (!force) {
    console.log('❌ This is a destructive operation.');
    console.log('   Run with --force or -f to confirm: npx ts-node scripts/reset-neo4j.ts --force\n');
    process.exit(1);
  }

  console.log('✅ Force flag detected, proceeding with reset...\n');

  // Step 1: Test connection
  console.log('━'.repeat(70));
  console.log('STEP 1: Testing Neo4j connection');
  console.log('━'.repeat(70));

  const connectionTest = await testNeo4jConnection();

  if (!connectionTest.success) {
    console.error('❌ Connection failed:', connectionTest.message);
    console.error('   Details:', connectionTest.details);
    process.exit(1);
  }

  console.log('✅ Connected to Neo4j');
  console.log(`   URI: ${connectionTest.details?.uri}`);
  console.log(`   Database: ${connectionTest.details?.database}`);
  console.log(`   Current node count: ${connectionTest.details?.nodeCount || 0}\n`);

  // Step 2: Get current stats (for logging)
  console.log('━'.repeat(70));
  console.log('STEP 2: Capturing current state');
  console.log('━'.repeat(70));

  const beforeStats = await getGraphStatistics();
  console.log(`   Nodes: ${beforeStats.nodeCount}`);
  console.log(`   Relationships: ${beforeStats.relationshipCount}`);
  if (Object.keys(beforeStats.labelCounts).length > 0) {
    console.log('   Breakdown:');
    for (const [label, count] of Object.entries(beforeStats.labelCounts)) {
      console.log(`     - ${label}: ${count}`);
    }
  }
  console.log();

  // Step 3: Drop schema (constraints and indexes)
  console.log('━'.repeat(70));
  console.log('STEP 3: Dropping constraints and indexes');
  console.log('━'.repeat(70));

  try {
    await dropSchema();
    console.log('✅ All constraints and indexes dropped\n');
  } catch (error: any) {
    console.log('⚠️  Schema drop had issues (may be empty):', error.message);
    console.log('   Continuing...\n');
  }

  // Step 4: Clear all data
  console.log('━'.repeat(70));
  console.log('STEP 4: Clearing all graph data');
  console.log('━'.repeat(70));

  try {
    await clearGraphData();
    console.log('✅ All graph data cleared\n');
  } catch (error: any) {
    console.error('❌ Failed to clear data:', error.message);
    process.exit(1);
  }

  // Step 5: Reset schema flag in database
  console.log('━'.repeat(70));
  console.log('STEP 5: Resetting schema initialization flag');
  console.log('━'.repeat(70));

  try {
    const config = await prisma.neo4jConfig.findFirst({
      where: { isActive: true },
    });

    if (config) {
      await prisma.neo4jConfig.update({
        where: { id: config.id },
        data: { schemaInitialized: false },
      });
      console.log('✅ Schema flag reset in database\n');
    } else {
      console.log('⚠️  No active Neo4j config found in database');
      console.log('   (This is okay if using environment variables)\n');
    }
  } catch (error: any) {
    console.log('⚠️  Could not reset schema flag:', error.message);
    console.log('   (This is okay if database is not yet configured)\n');
  }

  // Step 6: Initialize fresh schema
  console.log('━'.repeat(70));
  console.log('STEP 6: Initializing fresh schema');
  console.log('━'.repeat(70));

  const schemaResult = await initializeGraphSchema();

  if (!schemaResult.success) {
    console.error('❌ Schema initialization failed:', schemaResult.message);
    console.error('   Details:', schemaResult.details);
    process.exit(1);
  }

  console.log('✅ Schema initialized successfully');
  console.log(`   Constraints created: ${schemaResult.details?.constraintsCreated || 0}`);
  console.log(`   Indexes created: ${schemaResult.details?.indexesCreated || 0}\n`);

  // Step 7: Verify final state
  console.log('━'.repeat(70));
  console.log('STEP 7: Verifying final state');
  console.log('━'.repeat(70));

  const afterStats = await getGraphStatistics();
  const schemaReady = await isSchemaInitialized();

  console.log(`   Nodes: ${afterStats.nodeCount} (expected: 0)`);
  console.log(`   Relationships: ${afterStats.relationshipCount} (expected: 0)`);
  console.log(`   Schema initialized: ${schemaReady ? '✅ Yes' : '❌ No'}\n`);

  // Final summary
  console.log('='.repeat(70));
  console.log('🎉 NEO4J RESET COMPLETE');
  console.log('='.repeat(70));
  console.log('\nSummary:');
  console.log(`  • Deleted: ${beforeStats.nodeCount} nodes, ${beforeStats.relationshipCount} relationships`);
  console.log(`  • Created: ${schemaResult.details?.constraintsCreated || 0} constraints, ${schemaResult.details?.indexesCreated || 0} indexes`);
  console.log(`  • Schema status: ${schemaReady ? 'Ready' : 'Not ready (check logs)'}`);
  console.log('\nYou can now restart your application.\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n❌ Reset failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
