import { clearGraphData, initializeGraphSchema, dropSchema } from '../lib/neo4j/schema';

async function main() {
    try {
        console.log('Starting Neo4j Cleanup...');

        // 1. Clear Data
        console.log('\n--- Clearing Graph Data ---');
        await clearGraphData();

        // 2. Reset Schema (to ensure we are on the latest version)
        console.log('\n--- Resetting Schema ---');
        await dropSchema();
        await initializeGraphSchema();

        console.log('\nNeo4j database cleared and schema initialized successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

main();
