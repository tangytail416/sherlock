'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface StartInvestigationTableButtonProps {
  alertId: string;
  currentStatus: string;
}

export function StartInvestigationTableButton({ alertId, currentStatus }: StartInvestigationTableButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Only show the play button if the investigation is in a startable state
  const canStart = ['pending', 'stopped', 'failed'].includes(currentStatus);

  if (!canStart) {
    return null; // Hide the button if it's already active or completed
  }

  const handleStart = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId }),
      });

      if (!response.ok) {
        throw new Error('Failed to start investigation');
      }

      toast.success('Investigation started successfully');
      router.refresh(); // Refresh the table so the status changes to "active"
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to start investigation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={handleStart} 
      disabled={isLoading}
      title="Start Investigation"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Play className="h-4 w-4 text-primary" />
      )}
    </Button>
  );
}