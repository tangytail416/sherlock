'use client';

import { Activity, TrendingUp, Clock, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QueryStatsCardProps {
  stats: {
    successRate: number;
    avgExecutionTimeMs: number;
    totalFindings: number;
    totalExecutions: number;
  };
}

export function QueryStatsCard({ stats }: QueryStatsCardProps) {
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.totalExecutions > 0 ? `${Math.round(stats.successRate)}%` : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground">
            Based on recent executions 
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Time</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.totalExecutions > 0 ? formatTime(stats.avgExecutionTimeMs) : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground">
            Average query runtime
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Findings</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalFindings}</div>
          <p className="text-xs text-muted-foreground">
            Threats detected
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalExecutions}</div>
          <p className="text-xs text-muted-foreground">
            Times run
          </p>
        </CardContent>
      </Card>
    </div>
  );
}