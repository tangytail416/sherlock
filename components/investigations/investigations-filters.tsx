'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Search as SearchIcon, X, Loader2, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
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
import { useColorConfigs, getSeverityClasses, getInvestigationStatusClasses } from '@/lib/hooks/use-colors';
import { cn } from '@/lib/utils';

type Investigation = {
  id: string;
  status: string;
  priority: string;
  aiProvider: string | null;
  modelUsed: string | null;
  createdAt: Date;
  classificationTags: string[];
  threatTypeTags: string[];
  campaignTags: string[];
  alert: {
    id: string;
    title: string;
    severity: string;
    source: string;
  };
  agentExecutions: {
    id: string;
    status: string;
  }[];
};

interface InvestigationsFiltersProps {
  investigations: Investigation[];
}

export function InvestigationsFilters({ investigations }: InvestigationsFiltersProps) {
  const router = useRouter();
  const colors = useColorConfigs();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const filteredInvestigations = useMemo(() => {
    return investigations.filter((investigation) => {
      const matchesSearch =
        searchQuery === '' ||
        investigation.alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        investigation.alert.source.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' || investigation.status === statusFilter;
      const matchesSeverity =
        severityFilter === 'all' || investigation.alert.severity === severityFilter;

      return matchesSearch && matchesStatus && matchesSeverity;
    });
  }, [investigations, searchQuery, statusFilter, severityFilter]);

  const hasFilters = searchQuery !== '' || statusFilter !== 'all' || severityFilter !== 'all';

  // Checkbox Selection Logic
  const filteredIds = filteredInvestigations.map((i) => i.id);
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

  const handleBulkDelete = async () => {
    const ids = filteredIds.filter((id) => selectedIds.has(id));
    if (ids.length === 0) return;

    if (!confirm('Are you sure you want to delete the selected investigations? This action cannot be undone.')) {
      return;
    }

    setIsBulkUpdating(true);

    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/investigations/${id}`, {
            method: 'DELETE',
          }).then((res) => {
            if (!res.ok) throw new Error(`Failed to delete investigation ${id}`);
          })
        )
      );

      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = results.length - failed;

      if (failed === 0) {
        toast.success(`${succeeded} investigation${succeeded > 1 ? 's' : ''} deleted successfully`);
      } else if (succeeded === 0) {
        toast.error(`Failed to delete investigations. Please try again.`);
      } else {
        toast.warning(`${succeeded} deleted, ${failed} failed.`);
      }

      // Clear successfully deleted items from selection
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
        <div className="flex gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search investigations..."
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
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
                {selectedCount === 1 ? 'investigation selected' : 'investigations selected'}
              </span>
            </div>

            <Separator orientation="vertical" className="h-5 mx-1" />

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isBulkUpdating}
                onClick={handleBulkDelete}
                className="h-7 px-2.5 text-xs font-medium transition-colors bg-background text-red-600 border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-900 dark:hover:text-red-100"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Selected
              </Button>
            </div>

            {/* Spacer + dismiss */}
            <div className="ml-auto flex items-center gap-2">
              {isBulkUpdating && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Deleting…
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
                <TableHead>Alert</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Agent Executions</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvestigations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {hasFilters ? 'No investigations match your filters' : 'No investigations found'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvestigations.map((investigation) => (
                  <TableRow 
                    key={investigation.id} 
                    className="hover:bg-muted/50"
                    data-state={selectedIds.has(investigation.id) ? 'selected' : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(investigation.id)}
                        onCheckedChange={() => toggleRow(investigation.id)}
                        aria-label={`Select investigation ${investigation.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/investigations/${investigation.id}`}
                        className="font-medium hover:underline block"
                      >
                        {investigation.alert.title}
                      </Link>
                      <div className="text-sm text-muted-foreground">
                        {investigation.alert.source}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("border", getSeverityClasses(investigation.priority, colors))}
                      >
                        {investigation.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("border capitalize", getInvestigationStatusClasses(investigation.status, colors))}
                      >
                        {investigation.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {investigation.classificationTags?.length || 
                       investigation.threatTypeTags?.length || 
                       investigation.campaignTags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {investigation.classificationTags?.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {investigation.threatTypeTags?.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="default" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {investigation.campaignTags?.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs border-purple-500 text-purple-700">
                              {tag}
                            </Badge>
                          ))}
                          {((investigation.classificationTags?.length || 0) + 
                            (investigation.threatTypeTags?.length || 0) + 
                            (investigation.campaignTags?.length || 0)) > 6 && (
                            <Badge variant="outline" className="text-xs">
                              +more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">NA</span>
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          {hasFilters
            ? `Showing ${filteredInvestigations.length} of ${investigations.length} investigations`
            : `Showing ${investigations.length} investigation${investigations.length !== 1 ? 's' : ''}`}
        </div>
      </div>
    </TooltipProvider>
  );
}