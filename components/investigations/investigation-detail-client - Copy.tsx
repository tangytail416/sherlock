'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { AgentTimeline } from '@/components/investigations/agent-timeline';
import { GenerateReportButton } from '@/components/investigations/generate-report-button';
import { RestartInvestigationButton } from '@/components/investigations/restart-investigation-button';
import { ResumeInvestigationButton } from '@/components/investigations/resume-investigation-button';
import { StopInvestigationButton } from '@/components/investigations/stop-investigation-button';
import { InvestigationChat } from '@/components/investigations/investigation-chat';
import { PageLayout } from '@/components/layout/page-layout';

const statusColors = {
  pending: 'secondary',
  active: 'default',
  completed: 'secondary',
  failed: 'destructive',
  stopped: 'outline',
} as const;

const priorityColors = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
} as const;

interface Investigation {
  id: string;
  status: string;
  priority: string;
  aiProvider: string | null;
  modelUsed: string | null;
  createdAt: string;
  completedAt: string | null;
  findings: any;
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
    createdAt: string;
    completedAt: string | null;
    startedAt?: string | null;
    result: any;
    modelUsed?: string | null;
    errorMessage?: string | null;
    executionTime?: number | null;
    confidence?: number | null;
  }>;
  reports: Array<{
    id: string;
    title: string;
    summary: string | null;
    createdAt: string;
  }>;
}

export function InvestigationDetailClient({ id }: { id: string }) {
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Handle ESC key to close chat
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && chatOpen) {
        setChatOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [chatOpen]);

  useEffect(() => {
    async function fetchInvestigation() {
      try {
        const res = await fetch(`/api/investigations/${id}`);
        if (!res.ok) throw new Error('Failed to fetch investigation');
        const data = await res.json();
        setInvestigation(data);
      } catch (error) {
        console.error('Error fetching investigation:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchInvestigation();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchInvestigation, 5000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading investigation...</p>
      </div>
    );
  }

  if (!investigation) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Investigation not found</p>
      </div>
    );
  }

  const completedAgents = investigation.agentExecutions.filter(
    (exec) => exec.status === 'completed'
  ).length;
  const totalAgents = investigation.agentExecutions.length;
  const progress = totalAgents > 0 ? (completedAgents / totalAgents) * 100 : 0;

  const hasCompletedAgents = completedAgents > 0;
  const existingReport = investigation.reports.length > 0 ? investigation.reports[0] : null;

  const headerContent = (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 md:gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/investigations">
            <ArrowLeft className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">
            Investigation {investigation.id.slice(0, 8)}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(investigation.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {investigation.status === 'active' && (
          <StopInvestigationButton investigationId={investigation.id} />
        )}
        {(investigation.status === 'failed' || investigation.status === 'stopped') && hasCompletedAgents && (
          <ResumeInvestigationButton investigationId={investigation.id} />
        )}
        {(investigation.status === 'failed' || investigation.status === 'stopped' || investigation.status === 'completed') && (
          <RestartInvestigationButton investigationId={investigation.id} />
        )}
        <GenerateReportButton
          investigationId={investigation.id}
          hasCompletedAgents={hasCompletedAgents}
          existingReportId={existingReport?.id}
          investigationStatus={investigation.status}
        />
        <Badge variant={statusColors[investigation.status as keyof typeof statusColors]}>
          {investigation.status}
        </Badge>
      </div>
    </div>
  );

  return (
    <PageLayout header={headerContent}>
      <div className="relative">
        {/* Main Content */}
        <div className={`space-y-6 transition-all duration-300 ${chatOpen ? 'lg:mr-[400px]' : ''}`}>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Investigation Info */}
        <Card>
          <CardHeader>
            <CardTitle>Investigation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Priority</span>
              <Badge variant={priorityColors[investigation.priority as keyof typeof priorityColors]}>
                {investigation.priority}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">AI Provider</span>
              <span className="text-sm text-muted-foreground capitalize">
                {investigation.aiProvider || 'N/A'}
              </span>
            </div>
            <Separator />
            {investigation.modelUsed && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Model</span>
                  <span className="text-sm text-muted-foreground">
                    {investigation.modelUsed}
                  </span>
                </div>
                <Separator />
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Created</span>
              <span className="text-sm text-muted-foreground">
                {new Date(investigation.createdAt).toLocaleString()}
              </span>
            </div>
            {investigation.completedAt && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Completed</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(investigation.completedAt).toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Related Alert */}
        <Card>
          <CardHeader>
            <CardTitle>Related Alert</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/alerts/${investigation.alert.id}`}
              className="block p-4 border rounded-lg hover:bg-accent transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-medium">{investigation.alert.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {investigation.alert.source}
                  </p>
                </div>
                <Badge
                  variant={
                    investigation.alert.severity === 'critical' ||
                    investigation.alert.severity === 'high'
                      ? 'destructive'
                      : 'default'
                  }
                >
                  {investigation.alert.severity}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(investigation.alert.timestamp), {
                  addSuffix: true,
                })}
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {investigation.status === 'active' && (
        <Card>
          <CardHeader>
            <CardTitle>Investigation Progress</CardTitle>
            <CardDescription>
              {completedAgents} of {totalAgents} agents completed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Agent Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Executions</CardTitle>
          <CardDescription>
            Timeline of AI agent analysis and findings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {investigation.agentExecutions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No agent executions yet</p>
              <p className="text-sm mt-2">
                Investigation is pending. Agents will begin execution shortly.
              </p>
            </div>
          ) : (
            <AgentTimeline executions={investigation.agentExecutions as any} investigationId={investigation.id} />
          )}
        </CardContent>
      </Card>

      {/* Findings */}
      {investigation.findings && (
        <Card>
          <CardHeader>
            <CardTitle>Findings</CardTitle>
            <CardDescription>Summary of investigation results</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="p-4 bg-muted rounded-lg overflow-auto text-xs">
              {JSON.stringify(investigation.findings, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Reports */}
      {investigation.reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Reports</CardTitle>
            <CardDescription>
              {investigation.reports.length} report{investigation.reports.length > 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {investigation.reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="block p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <h3 className="font-medium">{report.title}</h3>
                  {report.summary && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {report.summary}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>

    {/* Floating Chat Button */}
    {!chatOpen && (
      <Button
        size="lg"
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg z-50"
        onClick={() => setChatOpen(true)}
      >
        <MessageSquare className="h-5 w-5 md:h-6 md:w-6" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
          >
            {unreadCount}
          </Badge>
        )}
      </Button>
    )}

    {/* Chat Overlay & Side Panel */}
    {chatOpen && (
      <>
        {/* Backdrop for mobile */}
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setChatOpen(false)}
        />

        {/* Chat Panel */}
        <div className="fixed inset-y-0 right-0 w-full sm:w-[90%] md:w-[500px] lg:w-[400px] bg-background border-l shadow-lg z-50 flex flex-col">
          <InvestigationChat
            investigationId={investigation.id}
            status={investigation.status}
            onClose={() => setChatOpen(false)}
          />
        </div>
      </>
    )}
      </div>
    </PageLayout>
  );
}
