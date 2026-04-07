'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteAllButtonProps {
  queryCount: number;
}

export function DeleteAllButton({ queryCount }: DeleteAllButtonProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      const response = await fetch('/api/queries?deleteAll=true', {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete queries');

      toast.success('All queries deleted successfully');
      setDeleteDialogOpen(false);
      window.location.reload();
    } catch (error) {
      toast.error('Failed to delete queries');
    } finally {
      setDeleting(false);
    }
  };

  if (queryCount === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setDeleteDialogOpen(true)}
        className="bg-black text-white hover:bg-gray-800 border-black"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete All
      </Button>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {queryCount} queries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting...' : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
