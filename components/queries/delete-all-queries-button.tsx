'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DeleteAllQueriesButton() {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAll = async () => {
    const confirmed = confirm(
      '🚨 WARNING: Are you absolutely sure you want to delete ALL saved queries? This action cannot be undone.'
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      // === CHANGED METHOD FROM 'POST' TO 'DELETE' ===
      await fetch('/api/queries/delete-all', { method: 'DELETE' });
      router.refresh();
    } catch (error) {
      console.error('Error deleting all queries:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button 
      variant="destructive" 
      onClick={handleDeleteAll} 
      disabled={isDeleting}
    >
      <Trash className="h-4 w-4 mr-2" />
      {isDeleting ? 'Deleting...' : 'Delete All'}
    </Button>
  );
}