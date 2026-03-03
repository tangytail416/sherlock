'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function InvestigateFindingButton({ findingId }: { findingId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleInvestigate = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/threat-findings/${findingId}/investigate`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to create investigation');
      }

      const data = await response.json();
      toast.success('Investigation started successfully');
      
      // Redirect to the newly created investigation page
      router.push(`/investigations/${data.investigationId}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to start investigation');
      setIsLoading(false);
    }
  };

  return (
    <Button 
      variant="default" 
      size="sm" 
      onClick={handleInvestigate} 
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Play className="mr-2 h-4 w-4" />
      )}
      Investigate
    </Button>
  );
}