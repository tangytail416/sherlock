import { prisma } from '@/lib/db';
import { createAIClient } from '@/lib/ai';
import { loadAgentConfig } from '@/lib/agents/config-loader';
import { getActiveWhitelistedIOCs, getWhitelistAsJSON } from '@/lib/agents/whitelist-helper';

export interface ReportGenerationOptions {
  investigationId: string;
  aiProvider?: string;
  includeGraphContext?: boolean;
}

export interface GeneratedReport {
  id: string;
  investigationId: string;
  title: string;
  content: any;
  summary: string | null;
  recommendations: string | null;
  createdAt: Date;
}

/**
 * Generate a comprehensive investigation report from an investigation ID.
 * This function is used by both the automatic workflow and manual regeneration.
 *
 * It loads investigation data from the database and generates a report using
 * only summarized agent findings (not full query results) to avoid context overflow.
 */
export async function generateInvestigationReport(
  options: ReportGenerationOptions
): Promise<GeneratedReport> {
  const {
    investigationId,
    aiProvider: providedAIProvider,
    includeGraphContext = true
  } = options;

  // Get investigation with all agent executions
  const investigation = await prisma.investigation.findUnique({
    where: { id: investigationId },
    include: {
      alert: true,
      agentExecutions: {
        where: {
          status: 'completed',
          OR: [
            { errorMessage: null },
            { errorMessage: { not: 'Superseded by restart' } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!investigation) {
    throw new Error(`Investigation not found: ${investigationId}`);
  }

  if (investigation.agentExecutions.length === 0) {
    throw new Error('No completed agent executions found');
  }

  // Get AI provider
  const aiProvider = providedAIProvider || investigation.aiProvider || 'anthropic';

  // Get report generator config
  const config = await loadAgentConfig('report_generator');
  if (!config) {
    throw new Error('Report generator configuration not found');
  }

  // Create AI client
  const client = await createAIClient(aiProvider);

  // Fetch whitelisted IOCs
  const whitelistedIOCs = await getActiveWhitelistedIOCs();
  const whitelistJSON = getWhitelistAsJSON(whitelistedIOCs);
  const whitelistSection = whitelistedIOCs.length > 0
    ? `\n\n=== WHITELISTED IOCs (EXCLUDED FROM ANALYSIS) ===\n${whitelistJSON}\n\nNOTE: These IOCs were filtered from all agent investigations and MUST NOT appear in your final report.\n`
    : '';

  // Build findings from agent executions - use SUMMARIZED data only (not full query results)
  // This prevents token overflow by only including high-level summaries
  const findings = investigation.agentExecutions.map((exec) => {
    const result = exec.result as any;

    // Extract only the high-level summary and key findings, NOT the full query results
    return {
      agent: exec.agentName,
      confidence: exec.confidence,
      executionTime: exec.executionTime,
      status: exec.status,
      // Only include summary-level findings, not detailed query results
      summary: result?.summary || result?.key_findings || result?.analysis || 'No summary available',
      key_findings: result?.key_findings || [],
      total_queries: result?.total_queries || 0,
      iterations: result?.iterations || 0,
    };
  });

  // Query Neo4j for graph-based context (if enabled)
  const neo4jEnabled = includeGraphContext && process.env.NEO4J_ENABLED !== 'false';
  let graphContext = {
    entities: [],
    relationships: [],
    relatedFindings: [],
    entityCounts: {},
    lateralMovement: [],
  };

  if (neo4jEnabled) {
    try {
      const { getInvestigationGraphContext, findLateralMovementPaths } = await import('@/lib/memory/graph-memory');

      const context = await getInvestigationGraphContext(investigationId);
      graphContext.entities = context.entities;
      graphContext.relationships = context.relationships;
      graphContext.relatedFindings = context.relatedFindings;
      graphContext.entityCounts = context.entityCounts;
      graphContext.lateralMovement = await findLateralMovementPaths(investigationId);

      console.log(`[Report Generator] Neo4j graph context loaded:`);
      console.log(`  - Entities: ${graphContext.entities.length}`);
      console.log(`  - Relationships: ${graphContext.relationships.length}`);
      console.log(`  - Related findings: ${graphContext.relatedFindings.length}`);
      console.log(`  - Lateral movement paths: ${graphContext.lateralMovement.length}`);
    } catch (error) {
      console.warn('[Report Generator] Failed to load Neo4j graph context:', error);
    }
  }

  // Build graph context section for prompt - LIMITED to prevent token overflow
  const graphContextSection = graphContext.entities.length > 0
    ? `\n\n=== NEO4J GRAPH CONTEXT (Summary) ===\n
**Entity Summary:**
${Object.entries(graphContext.entityCounts).map(([type, count]) => `- ${type}: ${count}`).join('\n')}

**Top 10 Key Entities:**
${graphContext.entities.slice(0, 10).map((e: any) => `- ${e.entityType}: ${e.entityValue}`).join('\n')}

**Top 5 Entity Relationships:**
${graphContext.relationships.slice(0, 5).map((r: any) =>
  `- ${r.sourceType} "${r.sourceValue}" ${r.relationshipType} ${r.targetType} "${r.targetValue}"`
).join('\n')}

**Lateral Movement:** ${graphContext.lateralMovement.length > 0
  ? `${graphContext.lateralMovement.length} path(s) detected`
  : 'None detected'}
`
    : '';

  // Generate comprehensive report using structured HTML output
  const synthesisPrompt = `
Create a comprehensive investigation report for this security incident.

ORIGINAL ALERT:
${JSON.stringify(investigation.alert, null, 2)}${whitelistSection}

AGENT INVESTIGATION SUMMARIES (high-level findings from each specialized agent):
${JSON.stringify(findings, null, 2)}${graphContextSection}

YOUR TASK:
Generate a comprehensive security investigation report. Return your response as a JSON object with the following structure:

{
  "sections": {
    "executive_summary": "HTML content - 3-5 paragraphs in plain language for executives. Use <p>, <strong>, <em> tags.",
    "threat_classification": "HTML content - MITRE ATT&CK mapping table. Use proper <table> with <thead> and <tbody>.",
    "key_findings": [
      "Finding 1 with confidence level",
      "Finding 2 with confidence level",
      ...
    ],
    "attack_timeline": [
      {
        "timestamp": "Nov 10, 2025 23:46",
        "event": "Brief description of what happened",
        "significance": "Why this matters"
      }
    ],
    "technical_summary": "HTML content - Detailed technical analysis with subsections. Use <h3>, <p>, <ul>, <code> tags.",
    "indicators_of_compromise": [
      "IP: 1.2.3.4 (Country) - Description",
      "Hash: abc123... - Malware name",
      ...
    ],
    "impact_assessment": {
      "confidentiality": "Impact description",
      "integrity": "Impact description",
      "availability": "Impact description",
      "scope": "Scope description"
    },
    "recommendations": [
      {
        "priority": "IMMEDIATE|SHORT_TERM|LONG_TERM",
        "action": "Specific action to take",
        "rationale": "Why this is important"
      }
    ],
    "conclusion": "HTML content - 2-3 paragraphs summarizing the investigation. Use <p> tags."
  },
  "metadata": {
    "severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "confidence": 85
  }
}

IMPORTANT FORMATTING GUIDELINES:
- Use semantic HTML tags: <p>, <strong>, <em>, <ul>, <li>, <code>, <pre>
- For tables, use proper structure: <table><thead><tr><th>...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table>
- For code blocks, use <pre><code>...</code></pre>
- Keep HTML clean and semantic - no inline styles, classes will be added during rendering
- Ensure all HTML is well-formed and properly closed
- Use <h3> for subsection headings within technical_summary

Return ONLY the JSON object, no additional text.
`;

  const response = await client.chat([
    { role: 'system', content: config.prompts.system },
    { role: 'user', content: synthesisPrompt },
  ]);

  // Parse the JSON response
  let reportData;
  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      reportData = JSON.parse(jsonMatch[0]);
    } else {
      reportData = JSON.parse(response.content);
    }
  } catch (parseError) {
    console.error('Failed to parse AI response as JSON:', parseError);
    // Fallback: treat as markdown and convert
    const markdownContent = response.content;

    const extractSection = (sectionName: string, content: string): string => {
      const regex = new RegExp(`##\\s*(?:SECTION\\s+\\d+:\\s*)?\\d*\\.?\\s*${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s*(?:SECTION\\s+\\d+:)?|\\n---|\\z)`, 'i');
      const match = content.match(regex);
      return match && match[1] ? match[1].trim() : '';
    };

    const extractList = (sectionName: string, content: string): string[] => {
      const section = extractSection(sectionName, content);
      if (!section) return [];
      const lines = section.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed) || trimmed.startsWith('**Finding');
      });
      return lines.map(line =>
        line.replace(/^[-*\d.]\s*/, '')
            .replace(/\*\*Finding \d+:\*\*\s*/i, '')
            .replace(/\(Confidence:.*?\)/, '')
            .trim()
      ).filter(Boolean);
    };

    reportData = {
      sections: {
        executive_summary: `<p>${extractSection('Executive Summary', markdownContent).replace(/\n\n/g, '</p><p>')}</p>`,
        threat_classification: extractSection('MITRE ATT&CK Mapping', markdownContent) || 'Security incident under investigation',
        key_findings: extractList('Key Findings', markdownContent),
        attack_timeline: [],
        technical_summary: `<p>${extractSection('Technical Analysis', markdownContent).replace(/\n\n/g, '</p><p>')}</p>`,
        indicators_of_compromise: extractList('Indicators of Compromise', markdownContent),
        impact_assessment: {},
        recommendations: [],
        conclusion: `<p>${extractSection('Conclusion', markdownContent).replace(/\n\n/g, '</p><p>')}</p>`,
      },
      metadata: {
        severity: investigation.alert.severity || 'MEDIUM',
        confidence: 75
      }
    };
  }

  const sections = reportData.sections || {};
  const metadata = reportData.metadata || {};

  // Determine severity
  const severity = metadata.severity || investigation.alert.severity || 'MEDIUM';

  // Create report in database with HTML sections
  const report = await prisma.report.create({
    data: {
      investigationId,
      title: `Investigation Report: ${investigation.alert.title}`,
      content: {
        sections: sections,
        severity: severity,
      },
      summary: sections.executive_summary?.replace(/<[^>]*>/g, '').substring(0, 3000) || 'Report generated successfully',
      recommendations: JSON.stringify(sections.recommendations || []),
    },
  });

  console.log(`[Report Generator] Report created successfully: ${report.id}`);
  return report;
}
