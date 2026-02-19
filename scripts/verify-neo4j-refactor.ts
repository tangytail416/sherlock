import { initializeGraphSchema, dropSchema, NodeLabel, RelationshipType } from '../lib/neo4j/schema';
import { addFindingToGraph, getEntityContext, findPath } from '../lib/memory/graph-memory';

function generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function main() {
    try {
        console.log('Starting Neo4j Refactoring Verification...');

        // 1. Reset Schema
        console.log('\n--- Resetting Schema ---');
        await dropSchema();
        await initializeGraphSchema();

        // 2. Add Test Data
        console.log('\n--- Adding Test Data ---');
        const findingId = generateId();
        const originalId = 'pg-123';

        // Scenario: User 'alice' logged onto Host 'workstation-01'
        await addFindingToGraph(
            findingId,
            originalId,
            'User alice logged onto workstation-01',
            'low',
            'auth-logs',
            [
                {
                    source: { type: NodeLabel.User, value: 'alice' },
                    target: { type: NodeLabel.Host, value: 'workstation-01' },
                    type: RelationshipType.LOGGED_ON,
                    description: 'Successful login via RDP'
                },
                {
                    source: { type: NodeLabel.Host, value: 'workstation-01' },
                    target: { type: NodeLabel.IPAddress, value: '192.168.1.100' },
                    type: RelationshipType.ASSIGNED_TO,
                    description: 'DHCP Assignment'
                }
            ]
        );

        // 3. Verify Context Query
        console.log('\n--- Verifying Context Query (User: alice) ---');
        const context = await getEntityContext(NodeLabel.User, 'alice');
        console.log('Context:', JSON.stringify(context, null, 2));

        if (context.length > 0 && context[0].relationship === 'LOGGED_ON' && context[0].neighborValue === 'workstation-01') {
            console.log('✓ Context query verified');
        } else {
            console.error('✗ Context query failed');
        }

        // 4. Verify Path Query (Lateral Movement Simulation)
        console.log('\n--- Verifying Path Query ---');
        // Add another hop: workstation-01 -> server-db
        await addFindingToGraph(
            generateId(),
            'pg-124',
            'Workstation connected to DB Server',
            'medium',
            'net-logs',
            [
                {
                    source: { type: NodeLabel.Host, value: 'workstation-01' },
                    target: { type: NodeLabel.Host, value: 'server-db' },
                    type: RelationshipType.CONNECTED_TO,
                    description: 'SMB Connection'
                }
            ]
        );

        const path = await findPath(NodeLabel.User, 'alice', NodeLabel.Host, 'server-db');
        console.log('Path found:', path ? 'Yes' : 'No');
        if (path) {
            console.log('✓ Path query verified');
        } else {
            console.error('✗ Path query failed');
        }

        console.log('\nVerification Complete!');
        process.exit(0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

main();
