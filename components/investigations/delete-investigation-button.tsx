'use client';

import { useRouter } from 'next/navigation';
import { Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DeleteInvestigationButton({ id }: { id: string }) {
  const router = useRouter();

  const handleDelete = async () => {
    ////const confirmed = confirm('DELETE INVESTIGATION?????????');
  /////  if (!confirmed) return;

    try {
      // Based on your route.ts file, the investigations endpoint uses the standard DELETE method
      await fetch(`/api/investigations/${id}`, { 
        method: 'DELETE' 
      });
      
      // Refresh the server component to instantly remove the deleted item from the table
      router.refresh();
    } catch (error) {
      console.error('Error deleting investigation:', error);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete}>
      <Trash className="h-4 w-4" />
    </Button>
  );
}