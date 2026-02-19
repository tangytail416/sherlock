/**
 * Threat Finding Deduplication Logic
 *
 * Generates unique hashes for threat findings to prevent duplicate investigations.
 * Uses SHA-256 hashing of normalized finding data to identify identical threats.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Interface for finding data used in hash generation
 */
export interface FindingData {
  finding_type: string;
  affected_entities: {
    users?: string[];
    hosts?: string[];
    ips?: string[];
    processes?: string[];
  };
  detected_at?: Date;
  time_bucket_hours?: number; // Group findings within time windows
}

/**
 * Normalize entity arrays for consistent hashing
 * - Removes duplicates
 * - Sorts alphabetically
 * - Converts to lowercase
 * - Filters empty strings
 */
function normalizeEntities(entities: string[] | undefined): string[] {
  if (!entities || entities.length === 0) {
    return [];
  }

  return Array.from(new Set(
    entities
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0)
  )).sort();
}

/**
 * Round timestamp to time bucket for grouping similar findings
 * @param timestamp - The detection timestamp
 * @param bucketHours - Size of time bucket in hours (default: 1)
 * @returns Bucketed timestamp as ISO string
 */
function bucketTimestamp(timestamp: Date, bucketHours: number = 1): string {
  const ms = timestamp.getTime();
  const bucketMs = bucketHours * 60 * 60 * 1000;
  const bucketedMs = Math.floor(ms / bucketMs) * bucketMs;
  return new Date(bucketedMs).toISOString();
}

/**
 * Generate a deterministic hash for a threat finding
 * @param data - Finding data to hash
 * @returns SHA-256 hash string
 */
export function generateFindingHash(data: FindingData): string {
  // Normalize all entity arrays
  const normalizedUsers = normalizeEntities(data.affected_entities.users);
  const normalizedHosts = normalizeEntities(data.affected_entities.hosts);
  const normalizedIps = normalizeEntities(data.affected_entities.ips);
  const normalizedProcesses = normalizeEntities(data.affected_entities.processes);

  // Normalize finding type
  const normalizedType = data.finding_type.trim().toLowerCase();

  // Bucket the timestamp if provided
  const timeBucket = data.detected_at
    ? bucketTimestamp(data.detected_at, data.time_bucket_hours || 1)
    : '';

  // Create a deterministic string representation
  const hashInput = {
    type: normalizedType,
    users: normalizedUsers,
    hosts: normalizedHosts,
    ips: normalizedIps,
    processes: normalizedProcesses,
    time_bucket: timeBucket,
  };

  // Generate JSON string with sorted keys for consistency
  const sortedKeys = Object.keys(hashInput).sort();
  const orderedInput: Record<string, any> = {};
  for (const key of sortedKeys) {
    orderedInput[key] = hashInput[key as keyof typeof hashInput];
  }

  const jsonString = JSON.stringify(orderedInput);

  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Check if a finding hash already exists in the database
 * @param hash - The finding hash to check
 * @param threatHuntId - Optional: limit check to specific threat hunt
 * @returns True if hash exists, false otherwise
 */
export async function isExistingFinding(
  hash: string,
  threatHuntId?: string
): Promise<boolean> {
  const whereClause: any = { findingHash: hash };

  if (threatHuntId) {
    whereClause.threatHuntId = threatHuntId;
  }

  const existing = await prisma.threatFinding.findFirst({
    where: whereClause,
  });

  return existing !== null;
}

/**
 * Check if a finding is a duplicate (already exists)
 * @param data - Finding data to check
 * @param threatHuntId - Optional: limit check to specific threat hunt
 * @returns Object with isDuplicate flag and hash
 */
export async function checkDuplicate(
  data: FindingData,
  threatHuntId?: string
): Promise<{ isDuplicate: boolean; hash: string }> {
  const hash = generateFindingHash(data);
  const isDuplicate = await isExistingFinding(hash, threatHuntId);

  return { isDuplicate, hash };
}

/**
 * Batch check multiple findings for duplicates
 * @param findings - Array of finding data to check
 * @param threatHuntId - Optional: limit check to specific threat hunt
 * @returns Array of findings with duplicate status and hash
 */
export async function batchCheckDuplicates(
  findings: FindingData[],
  threatHuntId?: string
): Promise<Array<FindingData & { isDuplicate: boolean; hash: string }>> {
  // Generate hashes for all findings
  const findingsWithHashes = findings.map(finding => ({
    ...finding,
    hash: generateFindingHash(finding),
  }));

  // Get all hashes
  const hashes = findingsWithHashes.map(f => f.hash);

  // Query database for existing findings with these hashes
  const whereClause: any = {
    findingHash: { in: hashes },
  };

  if (threatHuntId) {
    whereClause.threatHuntId = threatHuntId;
  }

  const existingFindings = await prisma.threatFinding.findMany({
    where: whereClause,
    select: { findingHash: true },
  });

  // Create set of existing hashes for O(1) lookup
  const existingHashes = new Set(existingFindings.map(f => f.findingHash));

  // Mark duplicates
  return findingsWithHashes.map(finding => ({
    ...finding,
    isDuplicate: existingHashes.has(finding.hash),
  }));
}

/**
 * Filter out duplicate findings from an array
 * @param findings - Array of finding data
 * @param threatHuntId - Optional: limit check to specific threat hunt
 * @returns Array of only new (non-duplicate) findings with hashes
 */
export async function filterDuplicates(
  findings: FindingData[],
  threatHuntId?: string
): Promise<Array<FindingData & { hash: string }>> {
  const checkedFindings = await batchCheckDuplicates(findings, threatHuntId);
  return checkedFindings.filter(f => !f.isDuplicate);
}

/**
 * Get statistics on findings including duplicate counts
 * @param threatHuntId - Optional: limit to specific threat hunt
 * @returns Statistics object
 */
export async function getFindingStats(threatHuntId?: string): Promise<{
  total_findings: number;
  unique_finding_types: number;
  findings_by_severity: Record<string, number>;
  findings_by_type: Record<string, number>;
}> {
  const whereClause: any = {};
  if (threatHuntId) {
    whereClause.threatHuntId = threatHuntId;
  }

  const findings = await prisma.threatFinding.findMany({
    where: whereClause,
    select: {
      findingType: true,
      severity: true,
    },
  });

  const findingTypes = new Set(findings.map(f => f.findingType));

  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
    byType[finding.findingType] = (byType[finding.findingType] || 0) + 1;
  }

  return {
    total_findings: findings.length,
    unique_finding_types: findingTypes.size,
    findings_by_severity: bySeverity,
    findings_by_type: byType,
  };
}

/**
 * Clean up old findings beyond the retention window
 * @param retentionDays - Number of days to retain findings
 * @returns Number of findings deleted
 */
export async function cleanupOldFindings(retentionDays: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.threatFinding.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}

/**
 * Example usage and testing utilities
 */
export const examples = {
  /**
   * Example: Generate hash for brute force finding
   */
  bruteForceExample: () => {
    const finding: FindingData = {
      finding_type: 'brute_force',
      affected_entities: {
        users: ['admin', 'administrator'],
        hosts: ['DC01'],
        ips: ['192.168.1.50'],
      },
      detected_at: new Date('2025-01-19T14:23:00Z'),
      time_bucket_hours: 1,
    };

    return generateFindingHash(finding);
  },

  /**
   * Example: Same entities, different order - should produce same hash
   */
  consistencyExample: () => {
    const finding1: FindingData = {
      finding_type: 'brute_force',
      affected_entities: {
        users: ['admin', 'root', 'administrator'],
        hosts: ['DC01', 'DC02'],
        ips: ['192.168.1.50'],
      },
      detected_at: new Date('2025-01-19T14:23:00Z'),
    };

    const finding2: FindingData = {
      finding_type: 'brute_force',
      affected_entities: {
        users: ['root', 'administrator', 'admin'], // Different order
        hosts: ['DC02', 'DC01'], // Different order
        ips: ['192.168.1.50'],
      },
      detected_at: new Date('2025-01-19T14:45:00Z'), // Same 1-hour bucket
    };

    const hash1 = generateFindingHash(finding1);
    const hash2 = generateFindingHash(finding2);

    return {
      hash1,
      hash2,
      are_equal: hash1 === hash2, // Should be true
    };
  },

  /**
   * Example: Different time buckets - should produce different hashes
   */
  timeBucketExample: () => {
    const finding1: FindingData = {
      finding_type: 'brute_force',
      affected_entities: {
        users: ['admin'],
        hosts: ['DC01'],
      },
      detected_at: new Date('2025-01-19T14:23:00Z'), // Hour 14
      time_bucket_hours: 1,
    };

    const finding2: FindingData = {
      finding_type: 'brute_force',
      affected_entities: {
        users: ['admin'],
        hosts: ['DC01'],
      },
      detected_at: new Date('2025-01-19T15:10:00Z'), // Hour 15
      time_bucket_hours: 1,
    };

    const hash1 = generateFindingHash(finding1);
    const hash2 = generateFindingHash(finding2);

    return {
      hash1,
      hash2,
      are_equal: hash1 === hash2, // Should be false (different hours)
    };
  },
};
