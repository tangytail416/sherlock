import { prisma } from '@/lib/db';
import { createAIClient, getDefaultAIClient } from '@/lib/ai';
import { loadAgentConfig } from '@/lib/agents/config-loader';

export interface ReportAggregationOptions {
  reportIds: string[];
  folderId: string;
  folderName: string;
  aiProvider?: string;
}

export interface AggregatedReport {
  id: string;
  investigationId: string | null;
  title: string;
  content: any;
  summary: string | null;
  recommendations: string | null;
  createdAt: Date;
}

export interface ReportSummary {
  id: string;
  title: string;
  summary: string | null;
  createdAt: Date;
  severity: string;
  key_findings: string[];
  indicators_of_compromise: any;
  attack_timeline: any[];
  threat_classification: string;
}

async function extractReportSummary(report: {
  id: string;
  title: string;
  summary: string | null;
  content: any;
  createdAt: Date;
  investigation: {
    alert: { severity: string };
  } | null;
}): Promise<ReportSummary> {
  const content = report.content as any;
  const sections = content?.sections || {};
  
  return {
    id: report.id,
    title: report.title,
    summary: report.summary,
    createdAt: report.createdAt,
    severity: sections?.metadata?.severity || report.investigation?.alert?.severity || 'MEDIUM',
    key_findings: sections?.key_findings || [],
    indicators_of_compromise: sections?.indicators_of_compromise || {},
    attack_timeline: sections?.attack_timeline || [],
    threat_classification: sections?.threat_classification || '',
  };
}

export async function aggregateReports(
  options: ReportAggregationOptions
): Promise<AggregatedReport> {
  const { reportIds, folderId, folderName, aiProvider } = options;

  if (reportIds.length < 2) {
    throw new Error('At least 2 reports are required for aggregation');
  }

  if (reportIds.length > 15) {
    throw new Error('Maximum 15 reports can be aggregated at once');
  }

  const reports = await prisma.report.findMany({
    where: {
      id: { in: reportIds },
    },
    include: {
      investigation: {
        include: {
          alert: true,
        },
      },
    },
  });

  const validReports = reports.filter(r => r.investigationId !== null && r.investigation !== null);

  if (validReports.length !== reportIds.length) {
    const foundIds = new Set(validReports.map(r => r.id));
    const missingOrAggregated = reportIds.filter(id => !foundIds.has(id));
    throw new Error(`Some reports were not found or are already aggregated: ${missingOrAggregated.join(', ')}`);
  }

  const config = await loadAgentConfig('report_aggregator');
  if (!config) {
    throw new Error('Report aggregator configuration not found');
  }

  const reportSummaries = await Promise.all(
    validReports.map(r => extractReportSummary(r as any))
  );

  const reportsData = reportSummaries.map((report, index) => `
=== REPORT ${index + 1}: ${report.title} ===
ID: ${report.id}
Created: ${report.createdAt.toISOString()}
Severity: ${report.severity}

Summary:
${report.summary || 'No summary available'}

Key Findings:
${report.key_findings.map((f, i) => `${i + 1}. ${f}`).join('\n') || 'No key findings'}

Indicators of Compromise:
${JSON.stringify(report.indicators_of_compromise, null, 2)}

Attack Timeline:
${JSON.stringify(report.attack_timeline, null, 2)}
`).join('\n\n---\n\n');

  const prompt = (config.prompts?.aggregation_template || '')
    .replace('{report_count}', String(reportIds.length))
    .replace('{folder_name}', folderName)
    .replace('{reports_data}', reportsData);

  // Get AI client - use specified provider or default from configuration
  const client = aiProvider 
    ? await createAIClient(aiProvider)
    : await getDefaultAIClient();

  const response = await client.chat([
    { role: 'system', content: config.prompts?.system || '' },
    { role: 'user', content: prompt },
  ]);

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
    throw new Error('Failed to parse aggregated report from AI response');
  }

  const sections = reportData.sections || {};
  const metadata = reportData.metadata || {};
  const severity = metadata.severity || 'MEDIUM';

  const report = await prisma.report.create({
    data: {
      investigationId: validReports[0].investigationId,
      title: `${folderName}: Summarized Report`,
      content: {
        sections,
        severity,
        aggregatedFrom: reportIds,
        aggregatedAt: new Date().toISOString(),
      },
      summary: sections.executive_summary?.substring(0, 4000) || 
        `Aggregated summary of ${reportIds.length} reports`,
      recommendations: JSON.stringify(sections.recommendations || []),
    },
  });

  await prisma.reportFolderItem.create({
    data: {
      folderId,
      reportId: report.id,
    },
  });

  console.log(`[Report Aggregator] Aggregated report created: ${report.id}`);

  return report as any;
}
