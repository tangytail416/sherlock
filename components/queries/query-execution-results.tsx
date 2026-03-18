'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface QueryExecutionResultsProps {
  results: any[];
  executionTimeMs?: number;
  error?: string | null;
}

export function QueryExecutionResults({
  results,
  executionTimeMs,
  error,
}: QueryExecutionResultsProps) {
  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Execution Failed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!results || results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Query Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No results found. The query executed successfully but returned no data.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Get all unique keys from the results
  const allKeys = Array.from(
    new Set(results.flatMap((result) => Object.keys(result)))
  );

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Query Results</CardTitle>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Badge variant="secondary">{results.length} results</Badge>
            {executionTimeMs !== undefined && (
              <Badge variant="outline">{formatTime(executionTimeMs)}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] w-full">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {allKeys.map((key) => (
                    <TableHead key={key} className="font-mono">
                      {key}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={index}>
                    {allKeys.map((key) => (
                      <TableCell key={key} className="font-mono text-xs">
                        {result[key] !== undefined && result[key] !== null
                          ? typeof result[key] === 'object'
                            ? JSON.stringify(result[key])
                            : String(result[key])
                          : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ScrollBar orientation='horizontal' />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
