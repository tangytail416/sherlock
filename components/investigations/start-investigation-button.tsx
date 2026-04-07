'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface StartInvestigationButtonProps {
  alertId: string;
}

export function StartInvestigationButton({ alertId }: StartInvestigationButtonProps) {
  const [isStarting, setIsStarting] = useState(false);
  const router = useRouter();

  const handleStart = async () => {
    setIsStarting(true);

    try {
      const response = await fetch('/api/investigations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ alertId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start investigation');
      }

      const data = await response.json();

      toast.success('Investigation started', {
        description: 'The investigation is now running.',
      });

      router.refresh();
    } catch (error: any) {
      console.error('Error starting investigation:', error);
      toast.error('Failed to start investigation', {
        description: error.message || 'An error occurred',
      });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Button onClick={handleStart} disabled={isStarting}>
      <Play className="h-4 w-4 mr-2" />
      {isStarting ? 'Starting...' : 'Start Investigation'}
    </Button>
  );
}
