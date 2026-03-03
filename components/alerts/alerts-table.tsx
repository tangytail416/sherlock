'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Search as SearchIcon, Trash } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Alert = {
  id: string;
  source: string;
  severity: string;
  title: string;
  status: string;
  timestamp: Date;
  investigations: { id: string; status: string }[];
};

interface AlertsTableProps {
  alerts: Alert[];
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

export function AlertsTable({ alerts }: AlertsTableProps) {
  const router = useRouter(); 
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const handleDelete = async (id: string) => {
    //const confirmed = confirm('Are you sure you want to delete this alert?');
    //if (!confirmed) return;

    try {
      await fetch(`/api/alerts/${id}/delete`, { method: 'POST' });
      router.refresh(); 
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity =
      severityFilter === 'all' || alert.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search alerts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Investigations</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAlerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No alerts found
                </TableCell>
              </TableRow>
            ) : (
              filteredAlerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell>
                    <Badge
                      variant={severityColors[alert.severity as keyof typeof severityColors]}
                    >
                      {alert.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link 
                      href={`/alerts/${alert.id}`}
                      className="hover:underline text-foreground"
                    >
                      {alert.title}
                    </Link>
                  </TableCell>
                  <TableCell>{alert.source}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[alert.status as keyof typeof statusColors]}>
                      {alert.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {alert.investigations.length > 0 ? (
                      <Link
                        href={`/investigations/${alert.investigations[0].id}`}
                        className="text-primary hover:underline"
                      >
                        {alert.investigations.length} investigation
                        {alert.investigations.length > 1 ? 's' : ''}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/alerts/${alert.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(alert.id)}>
                        <Trash className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {filteredAlerts.length} of {alerts.length} alerts
      </div>
    </div>
  );
}