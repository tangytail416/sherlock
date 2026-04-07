'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, FileText, Check, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Folder {
  id: string;
  name: string;
  color?: string | null;
  reportCount: number;
}

interface FolderDropdownProps {
  selectedFolderId?: string | null;
  onSelectFolder: (folderId: string | null) => void;
}

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export function FolderDropdown({ selectedFolderId, onSelectFolder }: FolderDropdownProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<Folder | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [loading, setLoading] = useState(false);

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
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/reports/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          color: color || null,
        }),
      });

      if (response.ok) {
        setName('');
        setColor('');
        setCreateDialogOpen(false);
        fetchFolders();
        toast.success('Folder created');
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFolder || !name.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/reports/folders/${editFolder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          color: color || null,
        }),
      });

      if (response.ok) {
        setName('');
        setColor('');
        setEditFolder(null);
        fetchFolders();
        toast.success('Folder updated');
      }
    } catch (error) {
      console.error('Error updating folder:', error);
      toast.error('Failed to update folder');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteFolder) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/reports/folders/${deleteFolder.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDeleteFolder(null);
        fetchFolders();
        if (selectedFolderId === deleteFolder.id) {
          onSelectFolder(null);
        }
        toast.success('Folder deleted');
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast.error('Failed to delete folder');
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (folder: Folder) => {
    setEditFolder(folder);
    setName(folder.name);
    setColor(folder.color || '');
  };

  const openDeleteDialog = (folder: Folder) => {
    setDeleteFolder(folder);
  };

  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            {selectedFolder ? (
              <>
                <FolderOpen className="h-4 w-4 mr-2" style={{ color: selectedFolder.color || undefined }} />
                {selectedFolder.name}
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                All Reports
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onSelectFolder(null)}>
            <FileText className="h-4 w-4 mr-2" />
            All Reports
            {!selectedFolderId && <Check className="h-4 w-4 ml-auto" />}
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            New Folder
          </DropdownMenuItem>
          
          {folders.length > 0 && <DropdownMenuSeparator />}
          
          {folders.map((folder) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className="justify-between"
            >
              <div className="flex items-center flex-1 min-w-0">
                <FolderOpen className="h-4 w-4 mr-2 shrink-0" style={{ color: folder.color || undefined }} />
                <span className="truncate">{folder.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{folder.reportCount}</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {selectedFolderId === folder.id && <Check className="h-4 w-4" />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditDialog(folder);
                  }}
                  className="p-1 hover:bg-muted rounded"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteDialog(folder);
                  }}
                  className="p-1 hover:bg-muted rounded"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Critical Incidents"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(color === c ? '' : c)}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-all',
                      color === c ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editFolder} onOpenChange={(open) => !open && setEditFolder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Folder</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Critical Incidents"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(color === c ? '' : c)}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-all',
                      color === c ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditFolder(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteFolder} onOpenChange={(open) => !open && setDeleteFolder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{deleteFolder?.name}"? The reports inside will not be deleted.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteFolder(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
