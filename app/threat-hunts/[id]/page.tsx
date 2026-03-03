import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Target, AlertTriangle, Clock, Activity, IterationCw, ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/page-layout';
import { InvestigateFindingButton } from '@/components/threat-hunting/investigate-finding-button';
import { AutoRefresh } from '@/components/auto-refresh';

type Alert = {
  id: string;
};

async function getThreatHunt(id: string) {
  try {
    const hunt = await prisma.threatHunt.findUnique({
      where: { id },
      include: {
        findings: {
          orderBy: { detectedAt: 'desc' },
          take: 100,
        },
      },
    });
    return hunt;
  } catch (error) {
    console.error('Error fetching threat hunt:', error);
    return null;
  }
}

const statusColors = {
  active: 'default',
  completed: 'secondary',
  failed: 'destructive',
  paused: 'outline',
} as const;

const severityColors = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
} as const;

export default async function ThreatHuntDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hunt = await getThreatHunt(id);
  
  if (!hunt) {
    notFound();
  }

  const config = hunt.config as any;
  const findingsSummary = {
    critical: hunt.findings.filter((f) => f.severity === 'critical').length,
    high: hunt.findings.filter((f) => f.severity === 'high').length,
    medium: hunt.findings.filter((f) => f.severity === 'medium').length,
    low: hunt.findings.filter((f) => f.severity === 'low').length,
  };

  const headerContent = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/threat-hunts">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Target className="h-6 w-6" />
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Threat Hunt</h1>
          <Badge variant={statusColors[hunt.status as keyof typeof statusColors] || 'default'}>
            {hunt.status}
          </Badge>
        </div>
      </div>
    </div>
  );

  return (
    <PageLayout header={headerContent}>
      {/* THIS IS THE NEW INVISIBLE AUTO-REFRESH COMPONENT */}
      <AutoRefresh isActive={hunt.status === 'active'} intervalMs={5000} />

      <div className="space-y-6">
        <div>
          <p className="text-muted-foreground" suppressHydrationWarning>
            Started {formatDistanceToNow(new Date(hunt.startedAt), { addSuffix: true })}
          </p>
        </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">All Findings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-xl" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hunt.findingsCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High/Critical</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {findingsSummary.high}/{findingsSummary.critical}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cycles Run</CardTitle>
            <IterationCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hunt.cyclesRun}/{config.maxCycles || 10}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Run</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm" suppressHydrationWarning>
              {hunt.lastRunAt
                ?  formatDistanceToNow(new Date(hunt.lastRunAt), { addSuffix: true })
                : 'No data'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Hunt Configuration</CardTitle>
          <CardDescription>Parameters used for this threat hunting operation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Time Range</div>
              <div className="mt-1">
                {config.timeRange ? (
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {config.timeRange.earliest} → {config.timeRange.latest}
                  </code>
                ) : (
                  <span className="text-sm">All time</span>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">AI Provider</div>
              <div className="mt-1 text-sm">
                {config.aiProvider || 'Default'} ({config.modelUsed || 'N/A'})
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Focus Areas</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {config.focusAreas && config.focusAreas.length > 0 ? (
                  config.focusAreas.map((area: string) => (
                    <Badge key={area} variant="outline" className="text-xs">
                      {area}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">All areas</span>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Auto-Investigation
              </div>
              <div className="mt-1 text-sm">
                {config.autoCreateInvestigations !== false ? (
                  <span>
                    Enabled (≥ {config.minSeverityForInvestigation || 'medium'})
                  </span>
                ) : (
                  <span>Disabled</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Findings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Findings ({hunt.findingsCount})</CardTitle>
          <CardDescription>
            Suspicious activities discovered during this hunt
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hunt.findings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nothing to show here yet
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Finding Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Entities</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hunt.findings.map((finding) => {
                    const entities = finding.affectedEntities as any;
                    const entityCount =
                      (entities.users?.length || 0) +
                      (entities.hosts?.length || 0) +
                      (entities.ips?.length || 0) +
                      (entities.processes?.length || 0);

                    return (
                      <TableRow key={finding.id}>
                        <TableCell className="font-mono text-sm">
                          {finding.findingType}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <Link href={`/alerts/${finding.alertId}`} className="block truncate hover:underline" title={finding.description}>
                            {finding.description}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              severityColors[finding.severity as keyof typeof severityColors]
                            }
                          >
                            {finding.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {entityCount} entit{entityCount !== 1 ? 'ies' : 'y'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {finding.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                          {formatDistanceToNow(new Date(finding.detectedAt), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          {finding.investigationId ? (
                            <Link href={`/investigations/${finding.investigationId}`}>
                              <Button variant="outline" size="sm">
                                View Investigation
                              </Button>
                            </Link>
                          ) : (
                            <InvestigateFindingButton findingId={finding.id} />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </PageLayout>
  );
}