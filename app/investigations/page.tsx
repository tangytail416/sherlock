import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Eye } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

async function getInvestigations() {
  try {
    const investigations = await prisma.investigation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        alert: {
          select: {
            id: true,
            title: true,
            severity: true,
            source: true,
          },
        },
        agentExecutions: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
    return investigations;
  } catch (error) {
    console.error('Error fetching investigations:', error);
    return [];
  }
}

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

export default async function InvestigationsPage() {
  const investigations = await getInvestigations();

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Investigations</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Track and manage AI-powered security investigations
          </p>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alert</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>AI Provider</TableHead>
              <TableHead>Agent Executions</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {investigations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No investigations found. Create an alert and start an investigation.
                </TableCell>
              </TableRow>
            ) : (
              investigations.map((investigation) => (
                <TableRow key={investigation.id}>
                  <TableCell>
                    <Link
                      href={`/alerts/${investigation.alert.id}`}
                      className="font-medium hover:underline"
                    >
                      {investigation.alert.title}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {investigation.alert.source}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        priorityColors[investigation.priority as keyof typeof priorityColors]
                      }
                    >
                      {investigation.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        statusColors[investigation.status as keyof typeof statusColors]
                      }
                    >
                      {investigation.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm capitalize">{investigation.aiProvider || 'N/A'}</span>
                    {investigation.modelUsed && (
                      <div className="text-xs text-muted-foreground">
                        {investigation.modelUsed}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {investigation.agentExecutions.length} agent
                      {investigation.agentExecutions.length !== 1 ? 's' : ''}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground" suppressHydrationWarning>
                    {formatDistanceToNow(new Date(investigation.createdAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/investigations/${investigation.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {investigations.length} investigation{investigations.length !== 1 ? 's' : ''}
      </div>
      </div>
    </div>
  );
}
