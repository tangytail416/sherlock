'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface RestartInvestigationButtonProps {
  investigationId: string;
}

export function RestartInvestigationButton({
  investigationId,
}: RestartInvestigationButtonProps) {
  const [isRestarting, setIsRestarting] = useState(false);
  const router = useRouter();

  const handleRestart = async () => {
    setIsRestarting(true);

    try {
      const response = await fetch(`/api/investigations/${investigationId}/restart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to restart investigation');
      }

      toast.success('Investigation restart initiated', {
        description: 'The orchestrator will re-run the investigation.',
      });

      // Refresh the page to show the updated status
      router.refresh();
    } catch (error: any) {
      console.error('Error restarting investigation:', error);
      toast.error('Failed to restart investigation', {
        description: error.message || 'An error occurred',
      });
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={isRestarting}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRestarting ? 'animate-spin' : ''}`} />
          Restart Investigation
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restart Investigation?</AlertDialogTitle>
          <AlertDialogDescription>
            This will restart the investigation by running the orchestrator agent again.
            All agent executions will be re-run with the current configuration.
            Previous execution records will be preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRestart} disabled={isRestarting}>
            {isRestarting ? 'Restarting...' : 'Restart'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
