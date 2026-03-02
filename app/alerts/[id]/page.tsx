import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { StartInvestigationButton } from '@/components/alerts/start-investigation-button';
import { PageLayout } from '@/components/layout/page-layout';

async function getAlert(id: string) {
  const alert = await prisma.alert.findUnique({
    where: { id },
    include: {
      investigations: {
        include: {
          agentExecutions: {
            select: {
              id: true,
              agentName: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!alert) {
    notFound();
  }

  return alert;
}

const severityColors = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
} as const;

const statusColors = {
  new: 'default',
  investigating: 'default',
  resolved: 'secondary',
  dismissed: 'secondary',
} as const;

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const alert = await getAlert(id);

  const headerContent = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/alerts">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">{alert.title}</h1>
          <p className="text-muted-foreground text-sm" suppressHydrationWarning>
            {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
          </p>
        </div>
      </div>
      {alert.status === 'new' && <StartInvestigationButton alertId={alert.id} />}
    </div>
  );

  return (
    <PageLayout header={headerContent}>
      <div className="space-y-6">

      <div className="grid gap-6 md:grid-cols-2">
        {/* Alert Information */}
        <Card>
          <CardHeader>
            <CardTitle>Alert Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Severity</span>
              <Badge variant={severityColors[alert.severity as keyof typeof severityColors]}>
                {alert.severity}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={statusColors[alert.status as keyof typeof statusColors]}>
                {alert.status}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Source</span>
              <span className="text-sm text-muted-foreground">{alert.source}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Created</span>
              <span className="text-sm text-muted-foreground">
                {new Date(alert.createdAt).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Investigations */}
        <Card>
          <CardHeader>
            <CardTitle>Investigations</CardTitle>
            <CardDescription>
              {alert.investigations.length > 0
                ? `${alert.investigations.length} inve67stigation${alert.investigations.length > 1 ? 's' : ''}`
                : 'No investigations yet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alert.investigations.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-4">
                  No investigations have been started for this alert
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {alert.investigations.map((investigation) => (
                  <Link
                    key={investigation.id}
                    href={`/investigations/${investigation.id}`}
                    className="block p-4 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Investigation {investigation.id.slice(0, 8)}</span>
                      <Badge>{investigation.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {investigation.agentExecutions.length} agent executions
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {alert.description && (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{alert.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Raw Data */}
      <Card>
        <CardHeader>
          <CardTitle>Raw Data</CardTitle>
          <CardDescription>Original alert data as received</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="p-4 bg-muted rounded-lg overflow-auto text-xs">
            {JSON.stringify(alert.rawData, null, 2)}
          </pre>
        </CardContent>
      </Card>
      </div>
    </PageLayout>
  );
}
