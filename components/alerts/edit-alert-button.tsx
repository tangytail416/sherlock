'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface EditAlertButtonProps {
  alert: {
    id: string;
    title: string;
    description: string | null;
    severity: string;
    status: string;
  };
}

export function EditAlertButton({ alert }: EditAlertButtonProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: alert.title,
    description: alert.description || '',
    severity: alert.severity,
    status: alert.status,
  });

  const handleOpen = () => {
    setEditForm({
      title: alert.title,
      description: alert.description || '',
      severity: alert.severity,
      status: alert.status,
    });
    setDialogOpen(true);
  };

  const updateAlert = async () => {
    setEditing(true);
    try {
      const response = await fetch(`/api/alerts/${alert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description || null,
          severity: editForm.severity,
          status: editForm.status,
        }),
      });

      if (!response.ok) throw new Error('Failed to update alert');

      toast.success('Alert updated successfully');
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error('Failed to update alert');
    } finally {
      setEditing(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <Edit className="h-4 w-4 mr-2" />
        Edit
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Alert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title *</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Alert title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Alert description"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-severity">Severity</Label>
              <Select 
                value={editForm.severity} 
                onValueChange={(value) => setEditForm({ ...editForm, severity: value })}
              >
                <SelectTrigger id="edit-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select 
                value={editForm.status} 
                onValueChange={(value) => setEditForm({ ...editForm, status: value })}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={editing}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button 
                onClick={updateAlert} 
                disabled={editing || !editForm.title}
              >
                {editing ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}