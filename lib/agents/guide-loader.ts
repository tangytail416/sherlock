/**
 * Guide Loader - Loads reference guides to append to agent system prompts
 */

import { promises as fs } from 'fs';
import path from 'path';

const GUIDES_DIR = path.join(process.cwd(), 'guides');

// Cache for loaded guides
let guidesCache: string | null = null;
let guidesCacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load all guides from the guides directory and combine them into a single string
 * to be appended to agent system prompts
 */
export async function loadAllGuides(): Promise<string> {
  // Check cache
  const now = Date.now();
  if (guidesCache && (now - guidesCacheTimestamp) < CACHE_TTL) {
    return guidesCache;
  }

  try {
    // Check if guides directory exists
    try {
      await fs.access(GUIDES_DIR);
    } catch {
      console.log('[Guide Loader] Guides directory not found');
      guidesCache = '';
      guidesCacheTimestamp = now;
      return '';
    }

    const files = await fs.readdir(GUIDES_DIR);
    const markdownFiles = files.filter((file) => file.endsWith('.md'));

    if (markdownFiles.length === 0) {
      console.log('[Guide Loader] No guide files found');
      guidesCache = '';
      guidesCacheTimestamp = now;
      return '';
    }

    const guideContents: string[] = [];

    for (const file of markdownFiles) {
      try {
        const filePath = path.join(GUIDES_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const guideName = file.replace(/\.md$/, '');
        
        guideContents.push(`\n\n=== REFERENCE GUIDE: ${guideName.toUpperCase()} ===\n${content}`);
        
        console.log(`[Guide Loader] Loaded guide: ${file} (${content.length} chars)`);
      } catch (error) {
        console.error(`[Guide Loader] Failed to load guide ${file}:`, error);
      }
    }

    if (guideContents.length > 0) {
      guidesCache = '\n\n' + '='.repeat(80) + '\n' +
                     'REFERENCE GUIDES FOR YOUR TASKS\n' +
                     '='.repeat(80) +
                     guideContents.join('\n') +
                     '\n' + '='.repeat(80);
      
      console.log(`[Guide Loader] Loaded ${guideContents.length} guide(s), total size: ${guidesCache.length} chars`);
    } else {
      guidesCache = '';
    }

    guidesCacheTimestamp = now;
    return guidesCache;
  } catch (error) {
    console.error('[Guide Loader] Failed to load guides:', error);
    guidesCache = '';
    guidesCacheTimestamp = now;
    return '';
  }
}

/**
 * Clear the guides cache (useful for testing or when guides are updated)
 */
export function clearGuidesCache(): void {
  guidesCache = null;
  guidesCacheTimestamp = 0;
}
