import { prisma } from '@/lib/db';
import { calculateAlertSimilarity } from './similarity';

/**
 * Query effectiveness scoring weights
 */
const SCORING_WEIGHTS = {
  findingsQuality: 0.4, // Did it find true positives vs false positives?
  resultRelevance: 0.3, // Were results relevant to the investigation context?
  efficiency: 0.2, // Low result count but high signal?
  reusability: 0.1, // Does it work across multiple investigations?
};

/**
 * Calculate effectiveness score for a query (0-100)
 */
export async function scoreQueryEffectiveness(
  query: string,
  findings: any[],
  investigationId: string,
  resultCount: number
): Promise<number> {
  try {
    // Load investigation and alert data
    const investigation = await prisma.investigation.findUnique({
      where: { id: investigationId },
      include: { alert: true },
    });

    if (!investigation) {
      return 0;
    }

    // 1. Findings Quality (0-100)
    let findingsQuality = 0;
    if (findings && findings.length > 0) {
      // Check if findings contain whitelisted entities (false positives)
      const whitelist = await prisma.iOCWhitelist.findMany({
        where: { isActive: true },
      });

      const whitelistedValues = new Set(
        whitelist.map((entry) => `${entry.type}:${entry.value}`)
      );

      let falsePositiveCount = 0;
      findings.forEach((finding) => {
        const findingStr = JSON.stringify(finding).toLowerCase();
        whitelist.forEach((entry) => {
          if (findingStr.includes(entry.value.toLowerCase())) {
            falsePositiveCount++;
          }
        });
      });

      const falsePositiveRate = findings.length > 0 ? falsePositiveCount / findings.length : 0;
      findingsQuality = Math.max(0, (1 - falsePositiveRate) * 100);
    } else {
      // No findings = low quality for this query
      findingsQuality = 10;
    }

    // 2. Result Relevance (0-100)
    // If results are in a reasonable range (not too many, not zero), it's relevant
    let resultRelevance = 0;
    if (resultCount === 0) {
      resultRelevance = 0;
    } else if (resultCount > 0 && resultCount <= 100) {
      resultRelevance = 100; // Sweet spot
    } else if (resultCount <= 1000) {
      resultRelevance = 70; // Acceptable
    } else if (resultCount <= 10000) {
      resultRelevance = 40; // Too many results
    } else {
      resultRelevance = 10; // Way too many results
    }

    // 3. Efficiency (0-100)
    // Signal-to-noise ratio
    let efficiency = 0;
    if (resultCount === 0) {
      efficiency = 0;
    } else {
      const signalCount = findings?.length || 0;
      const signalToNoise = signalCount / resultCount;

      if (signalToNoise > 0.5) {
        efficiency = 100; // Very efficient
      } else if (signalToNoise > 0.1) {
        efficiency = 80;
      } else if (signalToNoise > 0.01) {
        efficiency = 60;
      } else {
        efficiency = 30;
      }
    }

    // 4. Reusability (0-100)
    // Check if similar queries exist and work across investigations
    // For now, default to 50 (neutral) - this improves with more data
    let reusability = 50;

    // Calculate weighted score
    const score =
      findingsQuality * SCORING_WEIGHTS.findingsQuality +
      resultRelevance * SCORING_WEIGHTS.resultRelevance +
      efficiency * SCORING_WEIGHTS.efficiency +
      reusability * SCORING_WEIGHTS.reusability;

    return Math.round(score);
  } catch (error) {
    console.error('Error scoring query effectiveness:', error);
    return 0;
  }
}

/**
 * Auto-save a query if it's effective enough (score > 60)
 */
export async function autoSaveQuery(
  query: string,
  investigationId: string,
  findings: any[],
  resultCount: number,
  category?: string,
  mitreAttack?: string
): Promise<{ saved: boolean; queryId?: string; score: number }> {
  try {
    const score = await scoreQueryEffectiveness(query, findings, investigationId, resultCount);

    // Only auto-save if score is > 60
    if (score <= 60) {
      return { saved: false, score };
    }

    // Check if query already exists
    const existing = await prisma.savedQuery.findFirst({
      where: { splQuery: query },
    });

    if (existing) {
      // Update effectiveness score and stats
      await prisma.savedQuery.update({
        where: { id: existing.id },
        data: {
          effectivenessScore: (existing.effectivenessScore || 0 + score) / 2, // Moving average
          executionsCount: existing.executionsCount + 1,
          findingsCount: existing.findingsCount + (findings?.length || 0),
          lastExecutedAt: new Date(),
          avgResultsReturned:
            (existing.avgResultsReturned || 0 * existing.executionsCount + resultCount) /
            (existing.executionsCount + 1),
        },
      });

      return { saved: true, queryId: existing.id, score };
    }

    // Create new saved query
    const investigation = await prisma.investigation.findUnique({
      where: { id: investigationId },
      include: { alert: true },
    });

    const savedQuery = await prisma.savedQuery.create({
      data: {
        name: `Auto-saved query from Investigation ${investigationId.substring(0, 8)}`,
        description: `Automatically saved based on effectiveness score of ${score}/100`,
        splQuery: query,
        category: (category as any) || 'other',
        mitreAttack,
        isAutomated: true,
        autoSaved: true,
        effectivenessScore: score,
        successRate: 100, // First execution
        avgResultsReturned: resultCount,
        falsePositiveRate: 0,
        alertType: investigation?.alert?.title || undefined,
        investigationContext: {
          investigationId,
          alertId: investigation?.alertId,
          severity: investigation?.alert?.severity,
        },
        findingsProduced: findings?.slice(0, 5) || [], // Store sample findings
        findingsCount: findings?.length || 0,
        executionsCount: 1,
        lastExecutedAt: new Date(),
      },
    });

    console.log(`Auto-saved query ${savedQuery.id} with effectiveness score ${score}`);

    return { saved: true, queryId: savedQuery.id, score };
  } catch (error) {
    console.error('Error auto-saving query:', error);
    return { saved: false, score: 0 };
  }
}

/**
 * Suggest queries for a new alert based on similarity
 */
export async function suggestQueriesForAlert(
  alertData: any,
  limit: number = 10
): Promise<
  Array<{
    queryId: string;
    query: string;
    name: string;
    description: string | null;
    effectivenessScore: number;
    similarity: number;
    category: string;
  }>
> {
  try {
    // Get all saved queries with good effectiveness scores
    const queries = await prisma.savedQuery.findMany({
      where: {
        effectivenessScore: {
          gte: 50, // Only suggest queries with score >= 50
        },
      },
      orderBy: {
        effectivenessScore: 'desc',
      },
      take: 50, // Get top 50 for similarity calculation
    });

    if (queries.length === 0) {
      return [];
    }

    // Calculate similarity for each query's alert context
    const suggestions = [];

    for (const query of queries) {
      let similarity = 0;

      // If query has alert type context, calculate similarity
      if (query.alertType) {
        similarity = calculateAlertSimilarity(
          { title: alertData.title, severity: alertData.severity, rawData: alertData.rawData },
          {
            title: query.alertType,
            severity: (query.investigationContext as any)?.severity,
            rawData: {},
          }
        );
      } else {
        // Default similarity based on category match
        similarity = 0.3;
      }

      suggestions.push({
        queryId: query.id,
        query: query.splQuery,
        name: query.name,
        description: query.description,
        effectivenessScore: query.effectivenessScore || 0,
        similarity,
        category: query.category,
      });
    }

    // Sort by weighted score (effectiveness * similarity)
    suggestions.sort((a, b) => {
      const scoreA = a.effectivenessScore * (1 + a.similarity);
      const scoreB = b.effectivenessScore * (1 + b.similarity);
      return scoreB - scoreA;
    });

    return suggestions.slice(0, limit);
  } catch (error) {
    console.error('Error suggesting queries for alert:', error);
    return [];
  }
}

/**
 * Track false positive for a query
 */
export async function trackFalsePositive(queryId: string): Promise<void> {
  try {
    const query = await prisma.savedQuery.findUnique({
      where: { id: queryId },
    });

    if (!query) {
      return;
    }

    // Increment false positive rate
    const newFalsePositiveRate = (query.falsePositiveRate || 0) + 0.05; // Increase by 5%

    await prisma.savedQuery.update({
      where: { id: queryId },
      data: {
        falsePositiveRate: Math.min(newFalsePositiveRate, 1.0), // Cap at 100%
        effectivenessScore: Math.max((query.effectivenessScore || 0) - 10, 0), // Decrease score
      },
    });

    console.log(`Tracked false positive for query ${queryId}`);
  } catch (error) {
    console.error('Error tracking false positive:', error);
  }
}

/**
 * Update query statistics after execution
 */
export async function updateQueryStats(
  queryId: string,
  success: boolean,
  resultCount: number,
  findings?: any[]
): Promise<void> {
  try {
    const query = await prisma.savedQuery.findUnique({
      where: { id: queryId },
    });

    if (!query) {
      return;
    }

    const executionCount = query.executionsCount + 1;
    const successCount = success
      ? (query.successRate || 0) * query.executionsCount + 1
      : (query.successRate || 0) * query.executionsCount;

    const newSuccessRate = successCount / executionCount;
    const newAvgResults =
      ((query.avgResultsReturned || 0) * query.executionsCount + resultCount) / executionCount;

    await prisma.savedQuery.update({
      where: { id: queryId },
      data: {
        executionsCount: executionCount,
        successRate: newSuccessRate,
        avgResultsReturned: newAvgResults,
        findingsCount: query.findingsCount + (findings?.length || 0),
        lastExecutedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Error updating query stats:', error);
  }
}

/**
 * Get top performing queries
 */
export async function getTopQueries(limit: number = 10): Promise<any[]> {
  try {
    return await prisma.savedQuery.findMany({
      where: {
        effectivenessScore: {
          gte: 50,
        },
      },
      orderBy: [{ effectivenessScore: 'desc' }, { executionsCount: 'desc' }],
      take: limit,
    });
  } catch (error) {
    console.error('Error getting top queries:', error);
    return [];
  }
}
