'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface StartInvestigationButtonProps {
  alertId: string;
}

export function StartInvestigationButton({ alertId }: StartInvestigationButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleStartInvestigation() {
    // Prevent duplicate calls
    if (isLoading) return;
    
    setIsLoading(true);

    try {
      const response = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId,
          // aiProvider will use the default from database if not specified
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start investigation');
      }

      const investigation = await response.json();

      toast.success('Investigation started successfully');
      router.push(`/investigations/${investigation.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start investigation');
      console.error(error);
      setIsLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleStartInvestigation} disabled={isLoading}>
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Starting...
        </>
      ) : (
        <>
          <Play className="mr-2 h-4 w-4" />
          Start Investigation
        </>
      )}
    </Button>
  );
}
