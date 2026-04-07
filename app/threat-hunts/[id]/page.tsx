'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Target, AlertTriangle, Clock, Activity, Eye, Loader2, ArrowLeft } from 'lucide-react';
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
import { CreateInvestigationButton } from '@/components/threat-hunting/create-investigation-button';
import { useColorConfigs, getSeverityClasses, getInvestigationStatusClasses } from '@/lib/hooks/use-colors';
import { cn } from '@/lib/utils';

export default function ThreatHuntDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const colors = useColorConfigs();

  const [hunt, setHunt] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Real-time polling logic
  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchHunt = async () => {
      try {
        const res = await fetch(`/api/threat-hunts/${id}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          setHunt(data);

          // If the hunt is finished, stop polling the API
          if (data.status === 'completed' || data.status === 'failed' || data.status === 'error') {
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Error fetching threat hunt:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    // Initial fetch
    fetchHunt();
    
    // Poll every 3 seconds for new findings
    pollInterval = setInterval(fetchHunt, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [id]);

  if (isLoading) {
    return (
      <PageLayout header={<div className="h-10"></div>}>
        <div className="flex justify-center items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageLayout>
    );
  }

  if (!hunt) {
    return (
      <PageLayout header={<div className="h-10"></div>}>
        <div className="text-center py-12 text-muted-foreground">Threat hunt not found.</div>
      </PageLayout>
    );
  }

  const config = hunt.config || {};
  const findingsSummary = {
    critical: hunt.findings?.filter((f: any) => f.severity === 'critical').length || 0,
    high: hunt.findings?.filter((f: any) => f.severity === 'high').length || 0,
    medium: hunt.findings?.filter((f: any) => f.severity === 'medium').length || 0,
    low: hunt.findings?.filter((f: any) => f.severity === 'low').length || 0,
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
          <Badge 
            variant="outline" 
            className={cn("border capitalize", getInvestigationStatusClasses(hunt.status, colors))}
            suppressHydrationWarning
          >
            {hunt.status}
          </Badge>
          {hunt.status === 'active' && (
            <span className="flex h-3 w-3 ml-2">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <PageLayout header={headerContent}>
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
            <CardTitle className="text-sm font-medium">Total Findings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hunt.findingsCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical/High</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {findingsSummary.critical + findingsSummary.high}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {findingsSummary.critical} critical, {findingsSummary.high} high
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hunt Cycles</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
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
                ? formatDistanceToNow(new Date(hunt.lastRunAt), { addSuffix: true })
                : 'Not yet run'}
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
                  <span className="text-sm mt-1">All areas</span>
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
		<div>
              <div className="text-sm font-medium text-muted-foreground">CTI</div>
              <div className="mt-1 text-sm">
                {config.cti}
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
          {!hunt.findings || hunt.findings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {hunt.status === 'active' ? 'No findings yet. Hunt is in progress...' : 'No findings were discovered during this hunt.'}
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
                  {hunt.findings.map((finding: any) => {
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
                          {/* CHANGED TO LINK HERE */}
                          {finding.alertId ? (
                            <Link 
                              href={`/alerts/${finding.alertId}`} 
                              className="block truncate hover:underline text-foreground" 
                              title={finding.description}
                            >
                              {finding.description}
                            </Link>
                          ) : (
                            <div className="truncate" title={finding.description}>
                              {finding.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("border", getSeverityClasses(finding.severity, colors))}
                            suppressHydrationWarning
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
                          {finding.investigationStatus ? (
                            <Badge 
                              variant="outline"
                              className={cn("border text-xs capitalize", getInvestigationStatusClasses(finding.investigationStatus, colors))}
                              suppressHydrationWarning
                            >
                              {finding.investigationStatus}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {finding.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
                          {formatDistanceToNow(new Date(finding.detectedAt), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          {finding.investigationId ? (
                            <div className="flex justify-end">
                              <Link href={`/investigations/${finding.investigationId}`}>
                                <Button variant="outline" size="sm" className="min-w-[180px]">
                                  <span className="flex items-center">
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Investigation
                                  </span>
                                </Button>
                              </Link>
                            </div>
                          ) : (
                            <div className="flex justify-end">
                              <CreateInvestigationButton
                                threatHuntId={id}
                                findingId={finding.id}
                              />
                            </div>
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