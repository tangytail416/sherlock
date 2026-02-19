import Link from 'next/link';
import { Plus, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryLibraryTable } from '@/components/queries/query-library-table';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';

async function getQueries() {
  try {
    const queries = await prisma.savedQuery.findMany({
      orderBy: { lastExecutedAt: 'desc' },
      include: {
        _count: {
          select: {
            executions: true,
            threatFindings: true,
          },
        },
      },
    });
    return queries;
  } catch (error) {
    console.error('Error fetching queries:', error);
    return [];
  }
}

async function getStats() {
  try {
    const [totalQueries, automatedQueries, totalFindings, totalExecutions] =
      await Promise.all([
        prisma.savedQuery.count(),
        prisma.savedQuery.count({ where: { isAutomated: true } }),
        prisma.threatFinding.count({ where: { savedQueryId: { not: null } } }),
        prisma.queryExecution.count(),
      ]);

    return {
      totalQueries,
      automatedQueries,
      totalFindings,
      totalExecutions,
    };
  } catch (error) {
    console.error('Error fetching stats:', error);
    return {
      totalQueries: 0,
      automatedQueries: 0,
      totalFindings: 0,
      totalExecutions: 0,
    };
  }
}

export default async function QueriesPage() {
  const queries = await getQueries();
  const stats = await getStats();

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Query Library</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Browse and manage Splunk queries from agents and manual entries
          </p>
        </div>
        <Button asChild>
          <Link href="/queries/new">
            <Plus className="h-4 w-4 mr-2" />
            Create Query
          </Link>
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Queries
                </p>
                <p className="text-2xl font-bold">{stats.totalQueries}</p>
              </div>
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Agent-Generated
                </p>
                <p className="text-2xl font-bold">{stats.automatedQueries}</p>
              </div>
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Findings
                </p>
                <p className="text-2xl font-bold">{stats.totalFindings}</p>
              </div>
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Executions
                </p>
                <p className="text-2xl font-bold">{stats.totalExecutions}</p>
              </div>
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <QueryLibraryTable queries={queries} />
      </div>
    </div>
  );
}
