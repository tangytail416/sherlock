import { prisma } from '@/lib/db';

export interface WhitelistedIOC {
  type: string;
  value: string;
  reason?: string | null;
  addedBy?: string | null;
}

/**
 * Fetch all active whitelisted IOCs from the database
 * Returns them in a format suitable for agent prompts
 */
export async function getActiveWhitelistedIOCs(): Promise<WhitelistedIOC[]> {
  try {
    const whitelists = await prisma.iOCWhitelist.findMany({
      where: {
        isActive: true,
      },
      select: {
        type: true,
        value: true,
        reason: true,
        addedBy: true,
      },
      orderBy: {
        type: 'asc',
      },
    });

    return whitelists;
  } catch (error) {
    console.error('Error fetching whitelisted IOCs:', error);
    return [];
  }
}

/**
 * Format whitelisted IOCs for agent prompt
 * Groups by type for better readability
 */
export function formatWhitelistForPrompt(whitelists: WhitelistedIOC[]): string {
  if (whitelists.length === 0) {
    return 'No IOCs are currently whitelisted.';
  }

  // Group by type
  const grouped = whitelists.reduce((acc, ioc) => {
    if (!acc[ioc.type]) {
      acc[ioc.type] = [];
    }
    acc[ioc.type].push(ioc);
    return acc;
  }, {} as Record<string, WhitelistedIOC[]>);

  // Build formatted string
  let formatted = 'The following IOCs are WHITELISTED and should be EXCLUDED from your security analysis:\n\n';
  
  for (const [type, iocs] of Object.entries(grouped)) {
    formatted += `${type.toUpperCase()}:\n`;
    iocs.forEach(ioc => {
      formatted += `  - ${ioc.value}`;
      if (ioc.reason) {
        formatted += ` (Reason: ${ioc.reason})`;
      }
      formatted += '\n';
    });
    formatted += '\n';
  }

  formatted += 'IMPORTANT: Do NOT flag these IOCs as suspicious or include them in your findings. They are known safe entities.';
  
  return formatted;
}

/**
 * Get whitelisted IOCs as JSON for structured prompts
 */
export function getWhitelistAsJSON(whitelists: WhitelistedIOC[]): string {
  const grouped = whitelists.reduce((acc, ioc) => {
    if (!acc[ioc.type]) {
      acc[ioc.type] = [];
    }
    acc[ioc.type].push({
      value: ioc.value,
      reason: ioc.reason ?? null,
      addedBy: ioc.addedBy ?? null,
    });
    return acc;
  }, {} as Record<string, Array<{ value: string; reason: string | null; addedBy: string | null }>>);

  return JSON.stringify(grouped, null, 2);
}

/**
 * Check if a specific IOC value is whitelisted
 * Case-insensitive for usernames and domains
 */
export function isWhitelisted(
  type: string,
  value: string,
  whitelists: WhitelistedIOC[]
): boolean {
  const normalizeValue = (val: string, iocType: string): string => {
    // Case-insensitive for usernames and domains
    if (iocType === 'username' || iocType === 'domain') {
      return val.toLowerCase();
    }
    return val;
  };

  const normalizedValue = normalizeValue(value, type);

  return whitelists.some(
    (ioc) =>
      ioc.type === type &&
      normalizeValue(ioc.value, ioc.type) === normalizedValue
  );
}

/**
 * Filter out whitelisted IOCs from a list
 * Returns {filtered: IOC[], removed: IOC[]}
 */
export function filterWhitelistedFromList(
  iocs: Array<{ type: string; value: string }>,
  whitelists: WhitelistedIOC[]
): { filtered: Array<{ type: string; value: string }>; removed: Array<{ type: string; value: string }> } {
  const filtered: Array<{ type: string; value: string }> = [];
  const removed: Array<{ type: string; value: string }> = [];

  for (const ioc of iocs) {
    if (isWhitelisted(ioc.type, ioc.value, whitelists)) {
      removed.push(ioc);
    } else {
      filtered.push(ioc);
    }
  }

  return { filtered, removed };
}

/**
 * Filter Splunk events that contain whitelisted IOCs
 * Checks common fields: userIdentity.userName, sourceIPAddress, etc.
 */
export function filterWhitelistedFromSplunkResults(
  results: any[],
  whitelists: WhitelistedIOC[]
): { filtered: any[]; removedCount: number } {
  if (!results || results.length === 0) {
    return { filtered: results, removedCount: 0 };
  }

  let removedCount = 0;
  const filtered = results.filter((event) => {
    // Check username
    const username = event['userIdentity.userName'] || event.user || event.userName;
    if (username && isWhitelisted('username', username, whitelists)) {
      removedCount++;
      return false;
    }

    // Check IP address
    const ip = event.sourceIPAddress || event.src_ip || event.ip;
    if (ip && isWhitelisted('ip', ip, whitelists)) {
      removedCount++;
      return false;
    }

    // Check domain
    const domain = event.domain || event.dns_domain;
    if (domain && isWhitelisted('domain', domain, whitelists)) {
      removedCount++;
      return false;
    }

    // Check filename
    const filename = event.fileName || event.file_name || event.file;
    if (filename && isWhitelisted('filename', filename, whitelists)) {
      removedCount++;
      return false;
    }

    // Check hash (md5, sha256, etc.)
    const hash = event.file_hash || event.md5 || event.sha256 || event.hash;
    if (hash && isWhitelisted('hash', hash, whitelists)) {
      removedCount++;
      return false;
    }

    return true;
  });

  return { filtered, removedCount };
}
