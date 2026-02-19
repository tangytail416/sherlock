import Link from 'next/link';
import { AlertTriangle, Search, FileText, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/db';

async function getStats() {
  try {
    const [alertsCount, investigationsCount, reportsCount, activeInvestigations] = await Promise.all([
      prisma.alert.count(),
      prisma.investigation.count(),
      prisma.report.count(),
      prisma.investigation.count({
        where: { status: 'active' },
      }),
    ]);

    return {
      alertsCount,
      investigationsCount,
      reportsCount,
      activeInvestigations,
    };
  } catch (error) {
    // Return default stats if database is not set up yet
    return {
      alertsCount: 0,
      investigationsCount: 0,
      reportsCount: 0,
      activeInvestigations: 0,
    };
  }
}

export default async function Home() {
  const stats = await getStats();

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Welcome to Hunting Ground - AI-Powered Security Operations
          </p>
        </div>
        <Shield className="h-12 w-12 text-primary" />
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.alertsCount}</div>
            <p className="text-xs text-muted-foreground">Security alerts received</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Investigations</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeInvestigations}</div>
            <p className="text-xs text-muted-foreground">Currently in progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investigations</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.investigationsCount}</div>
            <p className="text-xs text-muted-foreground">All time investigations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports Generated</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.reportsCount}</div>
            <p className="text-xs text-muted-foreground">Investigation reports</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Button asChild variant="outline" className="h-auto flex-col items-start p-4">
            <Link href="/alerts/new">
              <AlertTriangle className="h-5 w-5 mb-2" />
              <span className="font-semibold">Create Alert</span>
              <span className="text-xs text-muted-foreground">Manually add a security alert</span>
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-auto flex-col items-start p-4">
            <Link href="/alerts">
              <AlertTriangle className="h-5 w-5 mb-2" />
              <span className="font-semibold">View Alerts</span>
              <span className="text-xs text-muted-foreground">Review all security alerts</span>
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-auto flex-col items-start p-4">
            <Link href="/investigations">
              <Search className="h-5 w-5 mb-2" />
              <span className="font-semibold">Investigations</span>
              <span className="text-xs text-muted-foreground">Track ongoing investigations</span>
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Getting Started */}
      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>Set up your environment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">1. Configure AI Providers</h4>
            <p className="text-sm text-muted-foreground">
              Set up your AI model providers (GLM 4.6, OpenAI, Azure, or OpenRouter) in the{' '}
              <Link href="/settings/providers" className="text-primary hover:underline">
                Settings page
              </Link>
              .
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">2. Set up Database</h4>
            <p className="text-sm text-muted-foreground">
              Make sure PostgreSQL is running and run <code className="bg-muted px-1 py-0.5 rounded">npm run db:push</code> to create the database schema.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">3. Start Receiving Alerts</h4>
            <p className="text-sm text-muted-foreground">
              Configure your security tools to send alerts to the webhook endpoint or create alerts manually.
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
