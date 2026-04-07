'use client';

import { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  MoreHorizontal,
  Folder,
  Pencil,
  Trash2,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateFolderDialog } from './create-folder-dialog';

export interface FolderItem {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  reportCount: number;
  createdAt: string;
}

interface FolderSidebarProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onFoldersChange?: () => void;
}

export function FolderSidebar({
  selectedFolderId,
  onSelectFolder,
  onFoldersChange,
}: FolderSidebarProps) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderItem | null>(null);

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    try {
      const response = await fetch('/api/reports/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Are you sure you want to delete this folder? Reports will not be deleted.')) {
      return;
    }

    try {
      const response = await fetch(`/api/reports/folders/${folderId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        if (selectedFolderId === folderId) {
          onSelectFolder(null);
        }
        onFoldersChange?.();
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  };

  const handleFolderCreated = (folder: FolderItem) => {
    setFolders((prev) => [folder, ...prev]);
    setCreateDialogOpen(false);
    onFoldersChange?.();
  };

  const handleFolderUpdated = (updatedFolder: FolderItem) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === updatedFolder.id ? updatedFolder : f))
    );
    setEditingFolder(null);
    onFoldersChange?.();
  };

  return (
    <div className="flex flex-col h-full w-64 border-r bg-muted/30">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Folders</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <button
            onClick={() => onSelectFolder(null)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              selectedFolderId === null
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-muted'
            )}
          >
            <FileText className="h-4 w-4" />
            <span>All Reports</span>
          </button>

          <div className="mt-2 space-y-1">
            {loading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : folders.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No folders yet
              </div>
            ) : (
              folders.map((folder) => (
                <div
                  key={folder.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-md transition-colors',
                    selectedFolderId === folder.id
                      ? 'bg-primary/10'
                      : 'hover:bg-muted'
                  )}
                >
                  <button
                    onClick={() => onSelectFolder(folder.id)}
                    className="flex-1 flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    {folder.color ? (
                      <Folder
                        className="h-4 w-4"
                        style={{ color: folder.color }}
                      />
                    ) : (
                      <FolderOpen className="h-4 w-4" />
                    )}
                    <span className="truncate">{folder.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {folder.reportCount}
                    </span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100 mr-1"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setEditingFolder(folder)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDeleteFolder(folder.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))
            )}
          </div>
        </div>
      </ScrollArea>

      <CreateFolderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleFolderCreated}
      />

      <CreateFolderDialog
        open={!!editingFolder}
        onOpenChange={(open) => !open && setEditingFolder(null)}
        folder={editingFolder}
        onUpdated={handleFolderUpdated}
      />
    </div>
  );
}
