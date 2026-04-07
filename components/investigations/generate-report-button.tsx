'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface GenerateReportButtonProps {
  investigationId: string;
  hasCompletedAgents: boolean;
  existingReportId?: string;
  investigationStatus: string;
}

export function GenerateReportButton({
  investigationId,
  hasCompletedAgents,
  existingReportId,
  investigationStatus,
}: GenerateReportButtonProps) {
  const [generating, setGenerating] = useState(false);
  const router = useRouter();

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          investigationId,
          regenerate: !!existingReportId 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(existingReportId ? 'Report regenerated successfully' : 'Report generated successfully');
        router.push(`/reports/${data.report.id}`);
        router.refresh();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to generate report');
      }
    } catch (error) {
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  if (existingReportId && investigationStatus === 'completed') {
    return (
      <Button onClick={handleGenerateReport} variant="outline" disabled={generating}>
        {generating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Regenerating...
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate Report
          </>
        )}
      </Button>
    );
  }

  if (existingReportId) {
    return (
      <Button onClick={() => router.push(`/reports/${existingReportId}`)}>
        <FileText className="mr-2 h-4 w-4" />
        View Report
      </Button>
    );
  }

  return (
    <Button
      onClick={handleGenerateReport}
      disabled={!hasCompletedAgents || generating}
    >
      {generating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileText className="mr-2 h-4 w-4" />
          Generate Report
        </>
      )}
    </Button>
  );
}
