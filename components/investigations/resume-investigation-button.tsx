'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { toast } from 'sonner';

interface ResumeInvestigationButtonProps {
  investigationId: string;
}

export function ResumeInvestigationButton({ investigationId }: ResumeInvestigationButtonProps) {
  const router = useRouter();
  const [isResuming, setIsResuming] = useState(false);

  const handleResume = async () => {
    setIsResuming(true);

    try {
      const response = await fetch(`/api/investigations/${investigationId}/resume`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resume investigation');
      }

      toast.success('Investigation resumed successfully', {
        description: 'The investigation will continue from where it stopped.',
      });

      // Refresh the page to show updated status
      router.refresh();
    } catch (error: any) {
      console.error('Error resuming investigation:', error);
      toast.error('Failed to resume investigation', {
        description: error.message,
      });
    } finally {
      setIsResuming(false);
    }
  };

  return (
    <Button onClick={handleResume} disabled={isResuming} variant="default">
      <Play className="h-4 w-4 mr-2" />
      {isResuming ? 'Resuming...' : 'Resume Investigation'}
    </Button>
  );
}
