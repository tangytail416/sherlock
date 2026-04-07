'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Search as SearchIcon, ChevronDown, X, Loader2, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { toast } from 'sonner';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { StartInvestigationButton } from '@/components/alerts/start-investigation-button';
import { DeleteAlertButton } from '@/components/alerts/delete-alert-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useColorConfigs, getSeverityClasses, getStatusClasses } from '@/lib/hooks/use-colors';
import { cn } from '@/lib/utils';

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
  totalCount?: number;
  currentOffset?: number;
  currentLimit?: number;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

export function AlertsTable({ 
  alerts, 
  totalCount, 
  currentOffset = 0, 
  currentLimit = 25 
}: AlertsTableProps) {
  const router = useRouter();
  const colors = useColorConfigs();
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity =
      severityFilter === 'all' || alert.severity === severityFilter;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'open'
        ? alert.status === 'new' || alert.status === 'investigating'
        : alert.status === statusFilter;

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const filteredIds = filteredAlerts.map((a) => a.id);
  const allSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = filteredIds.some((id) => selectedIds.has(id));
  const selectedCount = filteredIds.filter((id) => selectedIds.has(id)).length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    const ids = filteredIds.filter((id) => selectedIds.has(id));
    if (ids.length === 0) return;

    setIsBulkUpdating(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/alerts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          }).then((res) => {
            if (!res.ok) throw new Error(`Failed to update alert ${id}`);
          })
        )
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = results.length - failed;

      if (failed === 0) {
        toast.success(`${succeeded} alert${succeeded > 1 ? 's' : ''} updated to "${newStatus}"`);
      } else if (succeeded === 0) {
        toast.error('Failed to update alerts. Please try again.');
      } else {
        toast.warning(`${succeeded} updated, ${failed} failed.`);
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        results.forEach((result, i) => {
          if (result.status === 'fulfilled') next.delete(ids[i]);
        });
        return next;
      });

      router.refresh();
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsBulkUpdating(false);
    }
  };


  return (
    <TooltipProvider>
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
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk action bar */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 pl-0 pr-3 py-2 shadow-sm overflow-hidden">
            {/* Left accent stripe */}
            <div className="self-stretch w-1 rounded-r-full bg-primary shrink-0" />

            {/* Count */}
            <div className="flex items-center gap-1 pl-1">
              <span className="text-sm font-semibold text-primary tabular-nums">
                {selectedCount}
              </span>
              <span className="text-sm text-muted-foreground">
                {selectedCount === 1 ? 'alert selected' : 'alerts selected'}
              </span>
            </div>

            <Separator orientation="vertical" className="h-5 mx-1" />

            {/* Status change */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                Set status:
              </span>
              <div className="flex gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant="outline"
                    size="sm"
                    disabled={isBulkUpdating}
                    onClick={() => handleBulkStatusChange(opt.value)}
                    className="h-7 px-2.5 text-xs font-medium bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Spacer + dismiss */}
            <div className="ml-auto flex items-center gap-2">
              {isBulkUpdating && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating…
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    disabled={isBulkUpdating}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear selection</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        (el as HTMLInputElement).indeterminate = someSelected && !allSelected;
                      }
                    }}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Investigations</TableHead>
                <TableHead>Time</TableHead>
		<TableHead>Actions</TableHead>
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
                  <TableRow
                    key={alert.id}
                    data-state={selectedIds.has(alert.id) ? 'selected' : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(alert.id)}
                        onCheckedChange={() => toggleRow(alert.id)}
                        aria-label={`Select alert ${alert.id}`}
                      />
                    </TableCell>
                    <TableCell>
                       <Badge
                         variant="outline"
                         className={cn("border", getSeverityClasses(alert.severity, colors))}
                         suppressHydrationWarning
                       >
                         {alert.severity}
                       </Badge>
                     </TableCell>
                    <TableCell className="font-medium max-w-xs">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/alerts/${alert.id}`}
                            className="hover:underline text-foreground block truncate"
                          >
                            {alert.title}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-sm">{alert.title}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{alert.source}</TableCell>
                     <TableCell>
                       <Badge 
                         variant="outline" 
                         className={cn("border capitalize", getStatusClasses(alert.status, colors))}
                         suppressHydrationWarning
                       >
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
		    <TableCell>
			<div className="flex gap-1">
			{!['resolved','dismissed'].includes(alert.status)&&(alert.investigations.length>0?(<StartInvestigationButton alertId={alert.id}/>):(<StartInvestigationButton alertId={alert.id}/>))} {/*cause no point investigating if its dsimissed*/}
		    {alert.status==='dismissed'&&<DeleteAlertButton alertId={alert.id} alertTitle={alert.title}/>}
			</div>
		    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalCount !== undefined && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-muted-foreground">
              Showing {filteredAlerts.length} of {totalCount} alerts
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/alerts?offset=${Math.max(0, currentOffset - currentLimit)}&limit=${currentLimit}`)}
                disabled={currentOffset === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/alerts?offset=${currentOffset + currentLimit}&limit=${currentLimit}`)}
                disabled={currentOffset + currentLimit >= totalCount}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Select 
                  value={(currentLimit >= (totalCount || 0)) ? 'all' : currentLimit.toString()} 
                  onValueChange={(value) => {
                    if (value === 'all') {
                      router.push(`/alerts?offset=0&limit=${totalCount}`);
                    } else {
                      router.push(`/alerts?offset=0&limit=${value}`);
                    }
                  }}
                >
                  <SelectTrigger className="w-[90px] h-8">
                    <SelectValue placeholder="Limit" />
                  </SelectTrigger>
                  <SelectContent side="top">
                    <SelectItem value="25">25 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}