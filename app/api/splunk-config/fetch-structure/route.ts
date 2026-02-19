import { NextRequest, NextResponse } from 'next/server';
import { createSplunkClientFromDB } from '@/lib/splunk/client';
import { prisma } from '@/lib/db';

/**
 * Check if an index matches any exclusion pattern
 * Supports wildcards (* for any characters)
 */
function isIndexExcluded(index: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) continue;

    // Convert wildcard pattern to regex
    // Escape special regex characters except *
    const regexPattern = trimmedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    if (regex.test(index)) {
      return true;
    }
  }
  return false;
}

/**
 * Fetch indexes, sourcetypes, and extracted fields from Splunk
 * POST /api/splunk-config/fetch-structure
 */
export async function POST(_request: NextRequest) {
  try {
    // Get active Splunk config
    const config = await prisma.splunkConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return NextResponse.json(
        { error: 'No active Splunk configuration found' },
        { status: 404 }
      );
    }

    // Create Splunk client
    const client = await createSplunkClientFromDB();
    if (!client) {
      return NextResponse.json(
        { error: 'Failed to create Splunk client' },
        { status: 500 }
      );
    }

    // Step 1: Get list of indexes
    console.log('[Fetch Structure] Fetching indexes (all time)...');
    const indexesQuery = '| eventcount summarize=false index=* | dedup index | fields index';
    const indexResults = await client.oneshot(indexesQuery, {
      earliestTime: '0',
      latestTime: 'now',
      maxResults: 1000,
    });

    // Get exclusion patterns from config (default to "_*" if not set)
    const excludedPatterns = (config.excludedIndexes || '_*')
      .split(',')
      .map((p: string) => p.trim())
      .filter((p: string) => p);

    console.log(`[Fetch Structure] Exclusion patterns:`, excludedPatterns);

    // Filter indexes based on exclusion patterns
    const allIndexes = indexResults
      .map((result: any) => result.index)
      .filter((index: string) => index);

    const indexes = allIndexes.filter(
      (index: string) => !isIndexExcluded(index, excludedPatterns)
    );

    console.log(`[Fetch Structure] Found ${allIndexes.length} total indexes, ${indexes.length} after filtering:`, indexes);
    if (allIndexes.length > indexes.length) {
      const excluded = allIndexes.filter((index: string) => isIndexExcluded(index, excludedPatterns));
      console.log(`[Fetch Structure] Excluded ${excluded.length} indexes:`, excluded);
    }

    // Step 2: For each index, get sourcetypes and extracted fields
    const structure: Record<string, Record<string, { fields: string[] }>> = {};

    for (const index of indexes) {
      console.log(`[Fetch Structure] Processing index: ${index}`);
      structure[index] = {};

      try {
        // Get sourcetypes for this index using metadata (much faster than searching events)
        const sourcetypesQuery = `| metadata type=sourcetypes index=${index} | table sourcetype`;
        const sourcetypeResults = await client.oneshot(sourcetypesQuery, {
          earliestTime: '0',
          latestTime: 'now',
          maxResults: 100,
        });

        const sourcetypes = sourcetypeResults
          .map((result: any) => result.sourcetype)
          .filter((st: string) => st);

        console.log(`[Fetch Structure] Found ${sourcetypes.length} sourcetypes for index ${index}:`, sourcetypes);

        // Get extracted fields for each sourcetype using fieldsummary
        for (const sourcetype of sourcetypes) {
          try {
            console.log(`[Fetch Structure] Fetching fields for ${index}/${sourcetype} (sampling first 10000 events)`);
            const fieldsQuery = `search index=${index} sourcetype=${sourcetype} | head 10000 | fieldsummary | where count > 0 | fields field`;
            const fieldResults = await client.oneshot(fieldsQuery, {
              earliestTime: '0',
              latestTime: 'now',
              maxResults: 10000,
            });

            if (fieldResults.length > 0) {
              // Extract field names from results
              const fields = fieldResults
                .map((result: any) => result.field)
                .filter((field: string) => field && !field.startsWith('_')); // Exclude internal Splunk fields

              structure[index][sourcetype] = { fields };
              console.log(`[Fetch Structure] Found ${fields.length} fields for ${index}/${sourcetype}`);
            } else {
              structure[index][sourcetype] = { fields: [] };
              console.log(`[Fetch Structure] No fields found for ${index}/${sourcetype}`);
            }
          } catch (error: any) {
            console.error(`[Fetch Structure] Error fetching fields for ${index}/${sourcetype}:`, error.message);
            structure[index][sourcetype] = { fields: [] };
          }

          // Small delay to avoid overwhelming Splunk
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error: any) {
        console.error(`[Fetch Structure] Error processing index ${index}:`, error.message);
      }
    }

    // Step 3: Save structure to database
    console.log('[Fetch Structure] Saving structure to database...');
    await prisma.splunkConfig.update({
      where: { id: config.id },
      data: {
        indexStructure: structure,
        structureFetchedAt: new Date(),
      },
    });

    console.log('[Fetch Structure] Structure saved successfully');

    return NextResponse.json({
      success: true,
      message: 'Splunk structure fetched successfully',
      structure,
      indexCount: indexes.length,
      sourcetypeCount: Object.values(structure).reduce(
        (acc, sourcetypes) => acc + Object.keys(sourcetypes).length,
        0
      ),
    });
  } catch (error: any) {
    console.error('[Fetch Structure] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch Splunk structure',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
