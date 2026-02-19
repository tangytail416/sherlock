import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { format } from 'date-fns';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        investigation: {
          include: {
            alert: true,
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const content = report.content as any;
    // Data is stored at content root level, not under sections
    const sections = {
      executive_summary: content?.raw ? extractMarkdownSection(content.raw, 'Executive Summary') : '',
      threat_classification: content?.threat_classification || '',
      key_findings: content?.key_findings || [],
      attack_timeline: content?.attack_timeline || [],
      technical_summary: content?.technical_summary || '',
      indicators_of_compromise: content?.indicators_of_compromise || [],
      impact_assessment: content?.impact_assessment || {},
      conclusion: content?.conclusion || '',
    };
    const severity = content?.severity || report.investigation.alert.severity;
    
    // Helper function to extract markdown sections
    function extractMarkdownSection(markdown: string, sectionName: string): string {
      const regex = new RegExp(`##\\s*(?:SECTION\\s+\\d+:\\s*)?\\d*\\.?\\s*${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s*(?:SECTION\\s+\\d+:)?|\\n---|\\z)`, 'i');
      const match = markdown.match(regex);
      if (match && match[1]) {
        return match[1].trim().replace(/\n/g, '<br>');
      }
      return '';
    }
    
    const recommendations = typeof report.recommendations === 'string' 
      ? JSON.parse(report.recommendations) 
      : report.recommendations || [];

    // Generate professional HTML report with modern CSS
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #e5e7eb;
      background: #0a0a0a;
      padding: 0;
      margin: 0;
    }

    .report-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .report-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 60px 40px;
      border-radius: 12px;
      margin-bottom: 40px;
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.2);
    }

    .report-header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 20px;
      line-height: 1.2;
    }

    .report-meta {
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
      font-size: 14px;
      opacity: 0.95;
    }

    .report-meta-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .severity-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .severity-critical, .severity-high {
      background: #fee2e2;
      color: #991b1b;
    }

    .severity-medium {
      background: #fef3c7;
      color: #92400e;
    }

    .severity-low {
      background: #d1fae5;
      color: #065f46;
    }

    .section {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 24px;
      border: 1px solid #2a2a2a;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #2a2a2a;
    }

    .section-icon {
      font-size: 24px;
    }

    .section-title {
      font-size: 22px;
      font-weight: 700;
      color: #f3f4f6;
    }

    .section-content {
      color: #d1d5db;
      font-size: 15px;
    }

    .section-content p {
      margin-bottom: 16px;
    }

    .section-content h3 {
      font-size: 18px;
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 12px;
      color: #f9fafb;
    }

    .section-content ul, .section-content ol {
      margin-left: 24px;
      margin-bottom: 16px;
    }

    .section-content li {
      margin-bottom: 8px;
    }

    .section-content code {
      background: #2a2a2a;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      color: #e5e7eb;
    }

    .section-content pre {
      background: #0a0a0a;
      color: #e5e7eb;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 16px 0;
      border: 1px solid #2a2a2a;
    }

    .section-content pre code {
      background: none;
      padding: 0;
      color: inherit;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 14px;
    }

    thead {
      background: #2a2a2a;
    }

    th {
      text-align: left;
      padding: 12px;
      font-weight: 600;
      color: #f3f4f6;
      border-bottom: 2px solid #3a3a3a;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #2a2a2a;
      color: #d1d5db;
    }

    tbody tr:hover {
      background: #252525;
    }

    .finding-list {
      list-style: none;
      margin-left: 0;
    }

    .finding-item {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      padding: 12px;
      background: #252525;
      border-radius: 8px;
      border-left: 3px solid #667eea;
    }

    .finding-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      color: #10b981;
    }

    .timeline-event {
      padding: 16px;
      border-left: 3px solid #667eea;
      margin-left: 20px;
      margin-bottom: 20px;
      background: #252525;
      border-radius: 0 8px 8px 0;
    }

    .timeline-timestamp {
      font-weight: 600;
      color: #818cf8;
      margin-bottom: 8px;
    }

    .timeline-event-desc {
      color: #d1d5db;
      margin-bottom: 4px;
    }

    .timeline-significance {
      font-size: 14px;
      color: #9ca3af;
      font-style: italic;
    }

    .ioc-list {
      background: #2a2412;
      border: 1px solid #3a3416;
      border-radius: 8px;
      padding: 16px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 13px;
    }

    .ioc-item {
      padding: 8px 12px;
      margin: 4px 0;
      background: #1a1a0a;
      border-radius: 4px;
      border-left: 3px solid #eab308;
      color: #fef08a;
    }

    .recommendation-item {
      padding: 16px;
      margin-bottom: 12px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
      background: #252525;
    }

    .recommendation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .recommendation-action {
      font-weight: 600;
      color: #f3f4f6;
    }

    .priority-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .priority-immediate {
      background: #fee2e2;
      color: #991b1b;
    }

    .priority-short-term, .priority-short_term {
      background: #fed7aa;
      color: #9a3412;
    }

    .priority-long-term, .priority-long_term {
      background: #dbeafe;
      color: #1e40af;
    }

    .recommendation-rationale {
      font-size: 14px;
      color: #9ca3af;
    }

    .report-footer {
      margin-top: 60px;
      padding-top: 30px;
      border-top: 2px solid #2a2a2a;
      text-align: center;
      color: #9ca3af;
      font-size: 14px;
    }

    @media print {
      .report-container {
        padding: 20px;
      }
      .report-header {
        page-break-after: avoid;
      }
      .section {
        page-break-inside: avoid;
      }
    }

    @media (max-width: 768px) {
      .report-header {
        padding: 40px 24px;
      }
      .section {
        padding: 20px;
      }
      .report-meta {
        flex-direction: column;
        gap: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <!-- Report Header -->
    <div class="report-header">
      <h1>${report.title}</h1>
      <div class="report-meta">
        <div class="report-meta-item">
          <span>📅</span>
          <span>Generated: ${format(new Date(report.createdAt), 'MMMM d, yyyy HH:mm:ss')}</span>
        </div>
        <div class="report-meta-item">
          <span>🔍</span>
          <span>Investigation: ${report.investigation.id.slice(0, 8)}</span>
        </div>
        <div class="report-meta-item">
          <span>Severity:</span>
          <span class="severity-badge severity-${severity.toLowerCase()}">${severity}</span>
        </div>
      </div>
    </div>

    <!-- Executive Summary -->
    ${sections.executive_summary ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">📋</span>
        <h2 class="section-title">Executive Summary</h2>
      </div>
      <div class="section-content">
        ${sections.executive_summary}
      </div>
    </div>
    ` : ''}

    <!-- Threat Classification -->
    ${sections.threat_classification ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">⚠️</span>
        <h2 class="section-title">Threat Classification</h2>
      </div>
      <div class="section-content">
        ${sections.threat_classification}
      </div>
    </div>
    ` : ''}

    <!-- Key Findings -->
    ${sections.key_findings && sections.key_findings.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🎯</span>
        <h2 class="section-title">Key Findings</h2>
      </div>
      <div class="section-content">
        <ul class="finding-list">
          ${sections.key_findings.map((finding: string) => `
            <li class="finding-item">
              <span class="finding-icon">✓</span>
              <span>${finding}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
    ` : ''}

    <!-- Attack Timeline -->
    ${sections.attack_timeline && sections.attack_timeline.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">⏱️</span>
        <h2 class="section-title">Attack Timeline</h2>
      </div>
      <div class="section-content">
        ${sections.attack_timeline.map((event: any) => `
          <div class="timeline-event">
            <div class="timeline-timestamp">${event.timestamp}</div>
            <div class="timeline-event-desc">${event.event}</div>
            <div class="timeline-significance">${event.significance}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Technical Summary -->
    ${sections.technical_summary ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🔬</span>
        <h2 class="section-title">Technical Analysis</h2>
      </div>
      <div class="section-content">
        ${sections.technical_summary}
      </div>
    </div>
    ` : ''}

    <!-- Indicators of Compromise -->
    ${sections.indicators_of_compromise && sections.indicators_of_compromise.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">🛡️</span>
        <h2 class="section-title">Indicators of Compromise (IOCs)</h2>
      </div>
      <div class="section-content">
        <div class="ioc-list">
          ${sections.indicators_of_compromise.map((ioc: string) => `
            <div class="ioc-item">${ioc}</div>
          `).join('')}
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Impact Assessment -->
    ${sections.impact_assessment && Object.keys(sections.impact_assessment).length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">📊</span>
        <h2 class="section-title">Impact Assessment</h2>
      </div>
      <div class="section-content">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Assessment</th>
            </tr>
          </thead>
          <tbody>
            ${sections.impact_assessment.confidentiality ? `<tr><td><strong>Confidentiality</strong></td><td>${sections.impact_assessment.confidentiality}</td></tr>` : ''}
            ${sections.impact_assessment.integrity ? `<tr><td><strong>Integrity</strong></td><td>${sections.impact_assessment.integrity}</td></tr>` : ''}
            ${sections.impact_assessment.availability ? `<tr><td><strong>Availability</strong></td><td>${sections.impact_assessment.availability}</td></tr>` : ''}
            ${sections.impact_assessment.scope ? `<tr><td><strong>Scope</strong></td><td>${sections.impact_assessment.scope}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Recommendations -->
    ${recommendations && recommendations.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">💡</span>
        <h2 class="section-title">Recommendations</h2>
      </div>
      <div class="section-content">
        ${recommendations.map((rec: any) => `
          <div class="recommendation-item">
            <div class="recommendation-header">
              <div class="recommendation-action">${rec.action}</div>
              <span class="priority-badge priority-${rec.priority.toLowerCase()}">${rec.priority}</span>
            </div>
            <div class="recommendation-rationale">${rec.rationale}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Conclusion -->
    ${sections.conclusion ? `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">✅</span>
        <h2 class="section-title">Conclusion</h2>
      </div>
      <div class="section-content">
        ${sections.conclusion}
      </div>
    </div>
    ` : ''}

    <!-- Report Footer -->
    <div class="report-footer">
      <p><strong>Alert Source:</strong> ${report.investigation.alert.source}</p>
      <p><strong>Original Alert Time:</strong> ${format(new Date(report.investigation.alert.timestamp), 'MMMM d, yyyy HH:mm:ss')}</p>
      <p style="margin-top: 20px; opacity: 0.7;">
        This report was generated automatically by the Security Operations Center (SOC) Investigation System.
      </p>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="report-${id}-${Date.now()}.html"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting report:', error);
    return NextResponse.json(
      { error: 'Failed to export report', details: error.message },
      { status: 500 }
    );
  }
}
