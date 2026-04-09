'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Eye,
  FileText,
  FolderPlus,
  Layers,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { BulkAddToFolderDialog } from './bulk-add-to-folder-dialog';
import { AggregateReportsDialog } from './aggregate-reports-dialog';
import { useColorConfigs, getSeverityClasses } from '@/lib/hooks/use-colors';
import { cn } from '@/lib/utils';

interface ReportFolder {
  id: string;
  name: string;
  color?: string | null;
}

interface Report {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  isAggregated: boolean;
  folders: ReportFolder[];
  investigation?: {
    id: string;
    alert: {
      id: string;
      title: string;
      source: string;
      severity: string;
    };
  } | null;
  aggregatedCount?: number;
  aggregatedSeverity?: string;
}

interface ReportsTableProps {
  folderId?: string | null;
  folderName?: string;
}

export function ReportsTable({ folderId, folderName }: ReportsTableProps) {
  const colors = useColorConfigs();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkFolderDialogOpen, setBulkFolderDialogOpen] = useState(false);
  const [aggregateDialogOpen, setAggregateDialogOpen] = useState(false);
  const [showAllAggregated, setShowAllAggregated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchReports();
  }, [folderId]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const url = folderId ? `/api/reports?folderId=${folderId}` : '/api/reports';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const aggregatedReports = reports.filter(r => r.isAggregated);
  const individualReports = reports.filter(r => !r.isAggregated);

  const reportIds = individualReports.map((r) => r.id);
  const allSelected = reportIds.length > 0 && reportIds.every((id) => selectedIds.has(id));
  const someSelected = reportIds.some((id) => selectedIds.has(id));
  const selectedCount = reportIds.filter((id) => selectedIds.has(id)).length;
  const selectedIndividualCount = [...selectedIds].filter(id => 
    individualReports.some(r => r.id === id)
  ).length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reportIds));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkFolderAdded = () => {
    setIsBulkUpdating(false);
    fetchReports();
    clearSelection();
    toast.success('Reports added to folder(s)');
  };

  const handleAggregationCompleted = (reportId: string) => {
    fetchReports();
    clearSelection();
    router.push(`/reports/${reportId}`);
  };

  const canAggregate = folderId && selectedIndividualCount >= 2 && selectedIndividualCount <= 15;
  const overMaxLimit = folderId && selectedIndividualCount > 15;

  const renderAggregatedReportsSection = () => {
    if (aggregatedReports.length === 0) return null;

    const visibleReports = showAllAggregated ? aggregatedReports : aggregatedReports.slice(0, 1);
    const hasMore = aggregatedReports.length > 1;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">
            SUMMARY REPORTS ({aggregatedReports.length})
          </h3>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Reports</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleReports.map((report) => (
                <TableRow key={report.id} className="hover:bg-muted/50">
                  <TableCell></TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/reports/${report.id}`}
                      className="hover:underline"
                    >
                      {report.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {report.aggregatedCount || 0} reports
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("border", getSeverityClasses(report.aggregatedSeverity || 'medium', colors))}>
                      {report.aggregatedSeverity || 'MEDIUM'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground" suppressHydrationWarning>
                    {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/reports/${report.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {hasMore && !showAllAggregated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllAggregated(true)}
            className="w-full"
          >
            <ChevronDown className="h-4 w-4 mr-1" />
            Show {aggregatedReports.length - 1} more
          </Button>
        )}
        {hasMore && showAllAggregated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllAggregated(false)}
            className="w-full"
          >
            <ChevronUp className="h-4 w-4 mr-1" />
            Show less
          </Button>
        )}
      </div>
    );
  };

  const renderIndividualReportsSection = () => {
    return (
      <div className="space-y-3">
        {aggregatedReports.length > 0 && (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-muted-foreground">
              INDIVIDUAL REPORTS ({individualReports.length})
            </h3>
          </div>
        )}
        
        {selectedCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 pl-0 pr-3 py-2 shadow-sm overflow-hidden">
            <div className="self-stretch w-1 rounded-r-full bg-primary shrink-0" />
            <div className="flex items-center gap-1 pl-1">
              <span className="text-sm font-semibold text-primary tabular-nums">
                {selectedCount}
              </span>
              <span className="text-sm text-muted-foreground">
                {selectedCount === 1 ? 'report selected' : 'reports selected'}
              </span>
            </div>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isBulkUpdating}
                onClick={() => setBulkFolderDialogOpen(true)}
                className="h-7 px-2.5 text-xs font-medium"
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                Add to Folders
              </Button>
              {folderId && (
                <>
                  {canAggregate && (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isBulkUpdating}
                      onClick={() => setAggregateDialogOpen(true)}
                      className="h-7 px-2.5 text-xs font-medium"
                    >
                      <Layers className="h-3.5 w-3.5 mr-1.5" />
                      Aggregate Reports
                    </Button>
                  )}
                  {overMaxLimit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          disabled
                          className="h-7 px-2.5 text-xs font-medium opacity-50"
                        >
                          <Layers className="h-3.5 w-3.5 mr-1.5" />
                          Aggregate Reports
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Max 15 reports for aggregation ({selectedIndividualCount} selected)
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
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
                    onClick={clearSelection}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear selection</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {individualReports.length === 0 ? (
          aggregatedReports.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No reports generated yet</p>
              <p className="text-sm text-muted-foreground">
                Reports are generated after completing investigations
              </p>
            </div>
          )
        ) : (
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
                  <TableHead>Title</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Severity</TableHead>
                  {!folderId && <TableHead>Folders</TableHead>}
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {individualReports.map((report) => (
                  <TableRow
                    key={report.id}
                    className="hover:bg-muted/50"
                    data-state={selectedIds.has(report.id) ? 'selected' : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(report.id)}
                        onCheckedChange={() => toggleRow(report.id)}
                        aria-label={`Select report ${report.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/reports/${report.id}`}
                        className="hover:underline"
                      >
                        {report.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {report.investigation ? (
                        <>
                          <Link
                            href={`/alerts/${report.investigation.alert.id}`}
                            className="text-sm text-muted-foreground hover:underline"
                          >
                            {report.investigation.alert.title}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {report.investigation.alert.source}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", getSeverityClasses(report.investigation?.alert?.severity || 'medium', colors))}>
                        {report.investigation?.alert?.severity || 'unknown'}
                      </Badge>
                    </TableCell>
                    {!folderId && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {report.folders.length > 0 ? (
                            report.folders.slice(0, 3).map((folder) => (
                              <Badge
                                key={folder.id}
                                variant="secondary"
                                className="text-xs"
                                style={{
                                  backgroundColor: folder.color ? `${folder.color}15` : undefined,
                                  color: folder.color || undefined,
                                  borderColor: folder.color || undefined,
                                }}
                              >
                                {folder.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          {report.folders.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{report.folders.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/reports/${report.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          Showing {individualReports.length} individual report{individualReports.length !== 1 ? 's' : ''}
          {aggregatedReports.length > 0 && ` and ${aggregatedReports.length} summary report${aggregatedReports.length !== 1 ? 's' : ''}`}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading reports...
          </div>
        ) : (
          <>
            {renderAggregatedReportsSection()}
            {renderIndividualReportsSection()}
          </>
        )}

        <BulkAddToFolderDialog
          open={bulkFolderDialogOpen}
          onOpenChange={setBulkFolderDialogOpen}
          reportIds={[...selectedIds]}
          onCompleted={handleBulkFolderAdded}
        />

        {folderId && folderName && (
          <AggregateReportsDialog
            open={aggregateDialogOpen}
            onOpenChange={setAggregateDialogOpen}
            reportIds={[...selectedIds].filter(id => 
              individualReports.some(r => r.id === id)
            )}
            folderId={folderId}
            folderName={folderName}
            onCompleted={handleAggregationCompleted}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
