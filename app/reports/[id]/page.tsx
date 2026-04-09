'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  FileText,
  Target,
  Shield,
  TrendingUp,
  CheckCircle2,
  Download,
  Layers,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { PageLayout } from '@/components/layout/page-layout';

interface Report {
  id: string;
  title: string;
  summary: string;
  severity: string;
  createdAt: string;
  isAggregated?: boolean;
  aggregatedFrom?: string[];
  aggregatedAt?: string;
  content?: {
    sections?: {
      executive_summary?: string;
      threat_classification?: string | {
        mitre_techniques?: Array<{
          technique_id: string;
          technique_name: string;
          incidents?: string[];
        }>;
        campaign_analysis?: string;
        threat_actor_profile?: string;
      };
      incident_severity?: string;
      key_findings?: string[];
      attack_timeline?: Array<{
        timestamp: string;
        event: string;
        significance: string;
        incident?: string;
      }>;
      technical_summary?: string;
      indicators_of_compromise?: any;
      impact_assessment?: {
        confidentiality?: string;
        integrity?: string;
        availability?: string;
        scope?: string;
      };
      recommendations?: Array<{
        priority: string;
        action: string;
        rationale: string;
      }>;
      conclusion?: string;
      incident_overview?: Array<{
        report_id: string;
        title: string;
        severity: string;
        summary: string;
      }>;
      cross_incident_patterns?: Array<{
        pattern: string;
        evidence: string;
        incidents: string[];
        significance: string;
      }>;
    };
    raw?: string;
    analysis?: string;
    technical_summary?: string;
    threat_classification?: string | {
      mitre_techniques?: Array<{
        technique_id: string;
        technique_name: string;
        incidents?: string[];
      }>;
      campaign_analysis?: string;
      threat_actor_profile?: string;
    };
    key_findings?: string[];
    indicators_of_compromise?: string[];
    attack_timeline?: Array<{
      timestamp: string;
      event: string;
      significance: string;
    }>;
    impact_assessment?: any;
    conclusion?: string;
  };
  findings: {
    sections?: {
      executive_summary?: string;
      threat_classification?: string;
      technical_summary?: string;
      key_findings?: string[];
      attack_timeline?: Array<{
        timestamp: string;
        event: string;
        significance: string;
        incident?: string;
      }>;
      indicators_of_compromise?: any;
      impact_assessment?: {
        confidentiality?: string;
        integrity?: string;
        availability?: string;
        scope?: string;
      };
      conclusion?: string;
      incident_overview?: Array<{
        report_id: string;
        title: string;
        severity: string;
        summary: string;
      }>;
      cross_incident_patterns?: Array<{
        pattern: string;
        evidence: string;
        incidents: string[];
        significance: string;
      }>;
    };
    technical_summary?: string;
    threat_classification?: string;
    incident_severity?: string;
    key_findings?: string[];
    indicators_of_compromise?: string[];
    attack_timeline?: Array<{
      timestamp: string;
      event: string;
      significance: string;
    }>;
    impact_assessment?: {
      confidentiality?: string;
      integrity?: string;
      availability?: string;
      scope?: string;
    };
    conclusion?: string;
  };
  recommendations: Array<{
    priority: string;
    action: string;
    rationale: string;
  }> | string | null;
  investigation?: {
    id: string;
    status: string;
    alert: {
      id: string;
      title: string;
      source: string;
      severity: string;
      timestamp: string;
    };
    agentExecutions: Array<{
      id: string;
      agentName: string;
      status: string;
      confidence: number | null;
    }>;
  } | null;
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchReport(params.id as string);
    }
  }, [params.id]);

  const fetchReport = async (id: string) => {
    try {
      const response = await fetch(`/api/reports/${id}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data.report);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    if (!severity) return 'outline';
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getPriorityColor = (priority: string) => {
    if (!priority) return 'outline';
    switch (priority.toLowerCase()) {
      case 'immediate':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const exportReport = async () => {
    if (!report) return;

    try {
      const response = await fetch(`/api/reports/${report.id}/export`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${report.id}-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!report) return;

    try {
      const response = await fetch(`/api/reports/${report.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setDeleteDialogOpen(false);
        router.push('/reports');
      }
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading report...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Report not found</p>
        <Button onClick={() => router.push('/reports')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reports
        </Button>
      </div>
    );
  }

  const headerContent = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/reports')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-2">
            {report.isAggregated && <Layers className="h-6 w-6 text-muted-foreground" />}
            {report.title}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generated {format(new Date(report.createdAt), 'MMMM d, yyyy HH:mm')}
            {report.isAggregated && report.aggregatedFrom && (
              <span className="ml-2">from {report.aggregatedFrom.length} reports</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={getSeverityColor(report.severity) as any} className="text-base px-3 py-1">
          {report.severity}
        </Badge>
        <Button variant="outline" onClick={exportReport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button variant="outline" onClick={handleDeleteClick} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>
    </div>
  );

  const renderIOCs = (iocs: any) => {
    if (!iocs) return null;
    
    // Handle legacy array format
    if (Array.isArray(iocs)) {
      return (
        <div className="space-y-2">
          {iocs.map((ioc: string, idx: number) => (
            <div key={idx} className="p-3 bg-muted rounded-md font-mono text-sm">
              {ioc}
            </div>
          ))}
        </div>
      );
    }
    
    // Handle new structured format
    const sections = [];
    
    if (iocs.file_hashes?.length) {
      sections.push(
        <div key="file_hashes" className="space-y-2">
          <h4 className="font-medium text-sm">File Hashes</h4>
          {iocs.file_hashes.map((ioc: any, idx: number) => (
            <div key={idx} className="p-3 bg-muted rounded-md">
              <code className="text-sm">{ioc.hash}</code>
              <p className="text-xs text-muted-foreground mt-1">{ioc.description}</p>
              {ioc.incidents && <p className="text-xs text-muted-foreground">In: {ioc.incidents.join(', ')}</p>}
            </div>
          ))}
        </div>
      );
    }
    
    if (iocs.ip_addresses?.length) {
      sections.push(
        <div key="ip_addresses" className="space-y-2">
          <h4 className="font-medium text-sm">IP Addresses</h4>
          {iocs.ip_addresses.map((ioc: any, idx: number) => (
            <div key={idx} className="p-3 bg-muted rounded-md">
              <code className="text-sm">{ioc.ip}</code>
              {ioc.country && <span className="text-xs text-muted-foreground ml-2">({ioc.country})</span>}
              {ioc.type && <Badge variant="outline" className="ml-2 text-xs">{ioc.type}</Badge>}
              {ioc.incidents && <p className="text-xs text-muted-foreground mt-1">In: {ioc.incidents.join(', ')}</p>}
            </div>
          ))}
        </div>
      );
    }
    
    if (iocs.domains?.length) {
      sections.push(
        <div key="domains" className="space-y-2">
          <h4 className="font-medium text-sm">Domains</h4>
          {iocs.domains.map((ioc: any, idx: number) => (
            <div key={idx} className="p-3 bg-muted rounded-md">
              <code className="text-sm">{ioc.domain}</code>
              {ioc.type && <Badge variant="outline" className="ml-2 text-xs">{ioc.type}</Badge>}
              {ioc.incidents && <p className="text-xs text-muted-foreground mt-1">In: {ioc.incidents.join(', ')}</p>}
            </div>
          ))}
        </div>
      );
    }
    
    if (iocs.email_indicators?.length) {
      sections.push(
        <div key="email" className="space-y-2">
          <h4 className="font-medium text-sm">Email Indicators</h4>
          {iocs.email_indicators.map((ioc: any, idx: number) => (
            <div key={idx} className="p-3 bg-muted rounded-md">
              <code className="text-sm">{ioc.sender}</code>
              {ioc.subject_pattern && <p className="text-xs text-muted-foreground">Subject: {ioc.subject_pattern}</p>}
            </div>
          ))}
        </div>
      );
    }
    
    if (iocs.other?.length) {
      sections.push(
        <div key="other" className="space-y-2">
          <h4 className="font-medium text-sm">Other Indicators</h4>
          {iocs.other.map((ioc: any, idx: number) => (
            <div key={idx} className="p-3 bg-muted rounded-md">
              <code className="text-sm">{ioc.indicator}</code>
              {ioc.description && <p className="text-xs text-muted-foreground mt-1">{ioc.description}</p>}
            </div>
          ))}
        </div>
      );
    }
    
    return <div className="space-y-4">{sections}</div>;
  };

  const renderThreatClassification = (tc: any) => {
    if (!tc) return null;
    
    if (typeof tc === 'string') {
      return (
        <div className="prose prose-sm max-w-none dark:prose-invert overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {tc}
          </ReactMarkdown>
        </div>
      );
    }
    
    const sections = [];
    
    if (tc.mitre_techniques?.length) {
      sections.push(
        <div key="mitre" className="space-y-2">
          <h4 className="font-medium text-sm">MITRE ATT&CK Techniques</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Technique ID</TableHead>
                  <TableHead>Technique Name</TableHead>
                  <TableHead className="w-48">Incidents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tc.mitre_techniques.map((tech: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">
                      <a 
                        href={`https://attack.mitre.org/techniques/${tech.technique_id.replace('.', '/')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {tech.technique_id}
                      </a>
                    </TableCell>
                    <TableCell className="text-sm">{tech.technique_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tech.incidents?.join(', ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }
    
    if (tc.campaign_analysis) {
      sections.push(
        <div key="campaign" className="space-y-2">
          <h4 className="font-medium text-sm">Campaign Analysis</h4>
          <div className="p-3 bg-muted rounded-md">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {tc.campaign_analysis}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }
    
    if (tc.threat_actor_profile) {
      sections.push(
        <div key="actor" className="space-y-2">
          <h4 className="font-medium text-sm">Threat Actor Profile</h4>
          <div className="p-3 bg-muted rounded-md">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {tc.threat_actor_profile}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }
    
    return <div className="space-y-4">{sections}</div>;
  };

  return (
    <PageLayout header={headerContent}>
      <div className="space-y-6">

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {report.summary}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      {/* Incident Overview - For aggregated reports */}
      {report.isAggregated && report.findings?.sections?.incident_overview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Aggregated Incidents
            </CardTitle>
            <CardDescription>
              Summary of the {report.aggregatedFrom?.length} reports included in this aggregation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.findings.sections.incident_overview.map((incident, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <Link
                      href={`/reports/${incident.report_id}`}
                      className="font-medium hover:underline"
                    >
                      {incident.title}
                    </Link>
                    <Badge variant={getSeverityColor(incident.severity) as any}>
                      {incident.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{incident.summary}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check if report has HTML sections (new format) */}
      {report.findings?.sections && typeof report.findings.sections === 'object' && (
        <>
          {/* Threat Classification */}
          {report.findings.sections.threat_classification && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Threat Classification
                </CardTitle>
              </CardHeader>
              <CardContent>
                {renderThreatClassification(report.findings.sections.threat_classification)}
              </CardContent>
            </Card>
          )}

          {/* Cross-Incident Patterns - For aggregated reports */}
          {report.isAggregated && report.findings.sections.cross_incident_patterns && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Cross-Incident Patterns
                </CardTitle>
                <CardDescription>
                  Patterns identified across multiple incidents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.findings.sections.cross_incident_patterns.map((pattern, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <h4 className="font-medium mb-2">{pattern.pattern}</h4>
                      <p className="text-sm text-muted-foreground mb-2">{pattern.evidence}</p>
                      <p className="text-xs text-muted-foreground">{pattern.significance}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Findings - HTML */}
          {report.findings.sections.key_findings && report.findings.sections.key_findings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Key Findings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.findings.sections.key_findings.map((finding: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0" />
                      <span className="text-sm">{finding}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Technical Summary */}
          {report.findings.sections.technical_summary && (
            <Card>
              <CardHeader>
                <CardTitle>Technical Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report.findings.sections.technical_summary}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}

          {/* IOCs - HTML */}
          {report.findings.sections.indicators_of_compromise && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Indicators of Compromise (IOCs)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {renderIOCs(report.findings.sections.indicators_of_compromise)}
              </CardContent>
            </Card>
          )}

          {/* Attack Timeline - HTML */}
          {report.findings.sections.attack_timeline && report.findings.sections.attack_timeline.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Attack Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.findings.sections.attack_timeline.map((event: any, idx: number) => (
                    <div key={idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-3 w-3 rounded-full bg-primary" />
                        {idx < (report.findings.sections?.attack_timeline?.length || 0) - 1 && (
                          <div className="w-0.5 flex-1 bg-muted mt-2" />
                        )}
                      </div>
                      <div className="flex-1 pb-8">
                        <p className="font-semibold text-sm">{event.timestamp}</p>
                        <p className="text-sm mt-1">{event.event}</p>
                        {event.incident && (
                          <Badge variant="outline" className="text-xs mt-1">{event.incident}</Badge>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{event.significance}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Impact Assessment - HTML */}
          {report.findings.sections.impact_assessment && (
            <Card>
              <CardHeader>
                <CardTitle>Impact Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.findings.sections.impact_assessment.confidentiality && (
                    <div>
                      <p className="font-medium text-sm">Confidentiality</p>
                      <p className="text-sm text-muted-foreground">{report.findings.sections.impact_assessment.confidentiality}</p>
                    </div>
                  )}
                  {report.findings.sections.impact_assessment.integrity && (
                    <div>
                      <p className="font-medium text-sm">Integrity</p>
                      <p className="text-sm text-muted-foreground">{report.findings.sections.impact_assessment.integrity}</p>
                    </div>
                  )}
                  {report.findings.sections.impact_assessment.availability && (
                    <div>
                      <p className="font-medium text-sm">Availability</p>
                      <p className="text-sm text-muted-foreground">{report.findings.sections.impact_assessment.availability}</p>
                    </div>
                  )}
                  {report.findings.sections.impact_assessment.scope && (
                    <div>
                      <p className="font-medium text-sm">Scope</p>
                      <p className="text-sm text-muted-foreground">{report.findings.sections.impact_assessment.scope}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Conclusion */}
          {report.findings.sections.conclusion && (
            <Card>
              <CardHeader>
                <CardTitle>Conclusion</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report.findings.sections.conclusion}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Legacy format - Only show if HTML sections not present */}
      {(!report.findings?.sections || typeof report.findings.sections !== 'object') && (
        <>
          {/* Threat Classification */}
          {report.findings?.threat_classification && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Threat Classification
                </CardTitle>
              </CardHeader>
              <CardContent>
                {renderThreatClassification(report.findings.threat_classification)}
              </CardContent>
            </Card>
          )}

          {/* Key Findings */}
          {report.findings?.key_findings && report.findings.key_findings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Key Findings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.findings.key_findings.map((finding, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0" />
                      <div className="flex-1 prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {finding}
                        </ReactMarkdown>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Technical Summary */}
          {report.findings?.technical_summary && (
            <Card>
              <CardHeader>
                <CardTitle>Technical Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {report.findings.technical_summary}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Indicators of Compromise */}
          {report.findings?.indicators_of_compromise && report.findings.indicators_of_compromise.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Indicators of Compromise (IOCs)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.findings.indicators_of_compromise.map((ioc, idx) => (
                    <div key={idx} className="p-3 bg-muted rounded-md font-mono text-sm">
                      {ioc}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Attack Timeline */}
          {report.findings?.attack_timeline && report.findings.attack_timeline.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Attack Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.findings.attack_timeline.map((event, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-3 w-3 rounded-full bg-primary" />
                        {idx < report.findings.attack_timeline!.length - 1 && (
                          <div className="w-px h-full bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-medium">
                          {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm:ss')}
                        </p>
                        <p className="text-sm mt-1">{event.event}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.significance}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Impact Assessment */}
          {report.findings?.impact_assessment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Impact Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {report.findings.impact_assessment?.confidentiality && (
                    <div>
                      <p className="font-medium text-sm">Confidentiality</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {report.findings.impact_assessment.confidentiality}
                      </p>
                    </div>
                  )}
                  {report.findings.impact_assessment?.integrity && (
                    <div>
                      <p className="font-medium text-sm">Integrity</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {report.findings.impact_assessment.integrity}
                      </p>
                    </div>
                  )}
                  {report.findings.impact_assessment?.availability && (
                    <div>
                      <p className="font-medium text-sm">Availability</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {report.findings.impact_assessment.availability}
                      </p>
                    </div>
                  )}
                  {report.findings.impact_assessment?.scope && (
                    <div>
                      <p className="font-medium text-sm">Scope</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {report.findings.impact_assessment.scope}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Recommendations */}
      {report.recommendations && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>
              Prioritized actions to address the identified threats
            </CardDescription>
          </CardHeader>
          <CardContent>
            {typeof report.recommendations === 'string' ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {report.recommendations}
                </ReactMarkdown>
              </div>
            ) : Array.isArray(report.recommendations) && report.recommendations.length > 0 ? (
              <div className="space-y-4">
                {report.recommendations.map((rec, idx) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium">{rec.action}</h4>
                      <Badge variant={getPriorityColor(rec.priority) as any}>
                        {rec.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.rationale}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Related Investigation - Only for individual reports */}
      {report.investigation ? (
        <Card>
          <CardHeader>
            <CardTitle>Related Investigation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Investigation ID:</span>
                <Link
                  href={`/investigations/${report.investigation.id}`}
                  className="text-sm font-mono hover:underline"
                >
                  {report.investigation.id}
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Alert:</span>
                <Link
                  href={`/alerts/${report.investigation.alert.id}`}
                  className="text-sm hover:underline"
                >
                  {report.investigation.alert.title}
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Source:</span>
                <Badge variant="outline">{report.investigation.alert.source}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Agents Run:</span>
                <span className="text-sm">{report.investigation.agentExecutions.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : report.isAggregated ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Aggregation Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Reports Aggregated:</span>
                <span className="text-sm font-medium">{report.aggregatedFrom?.length || 0}</span>
              </div>
              {report.aggregatedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Aggregated On:</span>
                  <span className="text-sm">{format(new Date(report.aggregatedAt), 'MMM d, yyyy HH:mm')}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this report? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </PageLayout>
  );
}
