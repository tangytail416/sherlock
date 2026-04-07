'use client';

import { useState, useEffect } from 'react';
import { Check, FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Folder {
  id: string;
  name: string;
  color?: string | null;
}

interface BulkAddToFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportIds: string[];
  onCompleted: () => void;
}

export function BulkAddToFolderDialog({
  open,
  onOpenChange,
  reportIds,
  onCompleted,
}: BulkAddToFolderDialogProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchFolders();
      setSelectedIds(new Set());
    }
  }, [open]);

  const fetchFolders = async () => {
    try {
      const response = await fetch('/api/reports/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const toggleFolder = (folderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      onOpenChange(false);
      return;
    }

    setLoading(true);
    try {
      await Promise.all(
        [...selectedIds].map((folderId) =>
          fetch(`/api/reports/folders/${folderId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportIds }),
          })
        )
      );
      onCompleted();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding to folders:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Add {reportIds.length} {reportIds.length === 1 ? 'Report' : 'Reports'} to Folders
          </DialogTitle>
        </DialogHeader>

        {folders.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No folders available. Create a folder first.
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="space-y-1 pr-4">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => toggleFolder(folder.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    selectedIds.has(folder.id)
                      ? 'bg-primary/10'
                      : 'hover:bg-muted'
                  )}
                >
                  <div
                    className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
                    style={{
                      borderColor: folder.color || 'var(--border)',
                      backgroundColor: selectedIds.has(folder.id)
                        ? folder.color || 'hsl(var(--primary))'
                        : 'transparent',
                    }}
                  >
                    {selectedIds.has(folder.id) && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <FolderOpen
                    className="h-4 w-4 shrink-0"
                    style={{ color: folder.color || undefined }}
                  />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || folders.length === 0}>
            {loading ? 'Saving...' : `Add to ${selectedIds.size || ''} Folder${selectedIds.size !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
