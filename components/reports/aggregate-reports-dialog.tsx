'use client';

import { useState } from 'react';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface AggregateReportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportIds: string[];
  folderId: string;
  folderName: string;
  onCompleted: (reportId: string) => void;
}

export function AggregateReportsDialog({
  open,
  onOpenChange,
  reportIds,
  folderId,
  folderName,
  onCompleted,
}: AggregateReportsDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleAggregate = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/reports/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportIds,
          folderId,
          folderName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to aggregate reports');
      }

      const { report } = await response.json();
      toast.success('Reports aggregated successfully');
      onOpenChange(false);
      onCompleted(report.id);
    } catch (error) {
      console.error('Error aggregating reports:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to aggregate reports');
    } finally {
      setLoading(false);
    }
  };

  const showWarning = reportIds.length >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Aggregate Reports
          </DialogTitle>
          <DialogDescription>
            Create a consolidated summary report from {reportIds.length} selected reports.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Reports to aggregate:</span>
              <span className="font-semibold">{reportIds.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Target folder:</span>
              <span className="font-semibold">{folderName}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Output name:</span>
              <span className="font-semibold">{folderName}: Summarized Report</span>
            </div>
          </div>

          {showWarning && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Aggregating {reportIds.length} reports may take longer to process. 
                The AI will consolidate findings, deduplicate IOCs, and identify patterns.
              </AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">
            The aggregated report will appear in the <strong>Summary Reports</strong> section 
            at the top of this folder. It will consolidate IOCs, merge timelines, and identify 
            cross-incident patterns.
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAggregate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Aggregating...
              </>
            ) : (
              'Generate Summary Report'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
