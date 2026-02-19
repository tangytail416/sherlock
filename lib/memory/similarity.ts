/**
 * Alert similarity calculation service
 * Uses multiple similarity metrics to match alerts
 */

/**
 * Extract features from alert for similarity calculation
 */
export function extractAlertFeatures(alert: any): {
  title: string;
  severity: string;
  source: string;
  keywords: Set<string>;
  entities: Set<string>;
} {
  const features = {
    title: (alert.title || '').toLowerCase(),
    severity: (alert.severity || '').toLowerCase(),
    source: (alert.source || '').toLowerCase(),
    keywords: new Set<string>(),
    entities: new Set<string>(),
  };

  // Extract keywords from title and description
  const text = `${alert.title || ''} ${alert.description || ''}`.toLowerCase();
  const words = text.match(/\b\w+\b/g) || [];

  // Filter out common stop words
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'is',
    'was',
    'are',
    'were',
    'been',
    'be',
    'have',
    'has',
    'had',
  ]);

  words.forEach((word) => {
    if (word.length > 3 && !stopWords.has(word)) {
      features.keywords.add(word);
    }
  });

  // Extract entities from raw data if available
  if (alert.rawData) {
    const dataStr = JSON.stringify(alert.rawData).toLowerCase();

    // Extract IP addresses
    const ipPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    const ips = dataStr.match(ipPattern) || [];
    ips.forEach((ip) => features.entities.add(`ip:${ip}`));

    // Extract usernames (common patterns)
    const usernamePattern = /(?:user|username|account)[:\s]+([a-zA-Z0-9_\-\.]+)/gi;
    const userMatches = dataStr.matchAll(usernamePattern);
    for (const match of userMatches) {
      if (match[1]) {
        features.entities.add(`user:${match[1].toLowerCase()}`);
      }
    }

    // Extract hostnames
    const hostnamePattern = /(?:host|hostname|computer)[:\s]+([a-zA-Z0-9_\-\.]+)/gi;
    const hostMatches = dataStr.matchAll(hostnamePattern);
    for (const match of hostMatches) {
      if (match[1]) {
        features.entities.add(`host:${match[1].toLowerCase()}`);
      }
    }
  }

  return features;
}

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0;
  }

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) {
    return 0.0;
  }

  return intersection.size / union.size;
}

/**
 * Calculate string similarity (Levenshtein distance normalized)
 */
function stringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  const maxLength = Math.max(str1.length, str2.length);
  return 1 - matrix[str2.length][str1.length] / maxLength;
}

/**
 * Calculate overall alert similarity (0.0 - 1.0)
 */
export function calculateAlertSimilarity(alert1: any, alert2: any): number {
  const features1 = extractAlertFeatures(alert1);
  const features2 = extractAlertFeatures(alert2);

  // Severity match (exact match gets full weight)
  const severityMatch = features1.severity === features2.severity ? 1.0 : 0.0;

  // Source match
  const sourceMatch = features1.source === features2.source ? 1.0 : 0.0;

  // Title similarity (using string distance)
  const titleSimilarity = stringSimilarity(features1.title, features2.title);

  // Keyword overlap (Jaccard similarity)
  const keywordSimilarity = jaccardSimilarity(features1.keywords, features2.keywords);

  // Entity overlap (Jaccard similarity)
  const entitySimilarity = jaccardSimilarity(features1.entities, features2.entities);

  // Weighted combination
  const weights = {
    severity: 0.15,
    source: 0.10,
    title: 0.25,
    keywords: 0.30,
    entities: 0.20,
  };

  const overallSimilarity =
    severityMatch * weights.severity +
    sourceMatch * weights.source +
    titleSimilarity * weights.title +
    keywordSimilarity * weights.keywords +
    entitySimilarity * weights.entities;

  return Math.round(overallSimilarity * 100) / 100; // Round to 2 decimal places
}

/**
 * Find similar alerts from a list
 */
export function findSimilarAlerts(
  targetAlert: any,
  alerts: any[],
  threshold: number = 0.5
): Array<{ alert: any; similarity: number }> {
  const similarities = alerts
    .map((alert) => ({
      alert,
      similarity: calculateAlertSimilarity(targetAlert, alert),
    }))
    .filter((item) => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  return similarities;
}

/**
 * Calculate cosine similarity between two feature vectors
 */
export function cosineSimilarity(vector1: number[], vector2: number[]): number {
  if (vector1.length !== vector2.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    magnitude1 += vector1[i] * vector1[i];
    magnitude2 += vector2[i] * vector2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Convert alert features to numerical vector for ML-based similarity
 */
export function alertToVector(alert: any): number[] {
  const features = extractAlertFeatures(alert);

  // Create a simple feature vector
  const vector: number[] = [];

  // Severity encoding (0-3)
  const severityMap: Record<string, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };
  vector.push(severityMap[features.severity] || 0);

  // Source encoding (hash to 0-10)
  const sourceHash = features.source.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  vector.push(sourceHash % 10);

  // Keyword count
  vector.push(Math.min(features.keywords.size, 20)); // Cap at 20

  // Entity count
  vector.push(Math.min(features.entities.size, 20)); // Cap at 20

  // Title length (normalized)
  vector.push(Math.min(features.title.length / 100, 1.0));

  return vector;
}

/**
 * Calculate alert similarity using cosine similarity on feature vectors
 */
export function calculateVectorSimilarity(alert1: any, alert2: any): number {
  const vector1 = alertToVector(alert1);
  const vector2 = alertToVector(alert2);

  return cosineSimilarity(vector1, vector2);
}
