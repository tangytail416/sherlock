'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';

interface CreateInvestigationButtonProps {
  threatHuntId: string;
  findingId: string;
}

export function CreateInvestigationButton({ threatHuntId, findingId }: CreateInvestigationButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCreateInvestigation = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/threat-hunts/${threatHuntId}/create-investigation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create investigation');
      }

      const investigation = await response.json();
      router.push(`/investigations/${investigation.id}`);
    } catch (error) {
      console.error('Error creating investigation:', error);
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="min-w-[180px]"
      onClick={handleCreateInvestigation}
      disabled={loading}
    >
      <span className="flex items-center">
        {loading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Create Investigation
      </span>
    </Button>
  );
}
