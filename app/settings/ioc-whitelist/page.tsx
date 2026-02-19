'use client';

import { useEffect, useState } from 'react';
import { Plus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WhitelistForm } from '@/components/ioc-whitelist/whitelist-form';
import { WhitelistTable } from '@/components/ioc-whitelist/whitelist-table';
import { toast } from 'sonner';

interface IOCWhitelist {
  id: string;
  type: string;
  value: string;
  reason: string | null;
  addedBy: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: any;
}

export default function IOCWhitelistPage() {
  const [whitelists, setWhitelists] = useState<IOCWhitelist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<IOCWhitelist | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchWhitelists = async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (statusFilter !== 'all') params.append('isActive', statusFilter);

      const response = await fetch(`/api/ioc-whitelist?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setWhitelists(data.whitelists);
      }
    } catch (error) {
      toast.error('Failed to fetch IOC whitelists');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWhitelists();
  }, [typeFilter, statusFilter]);

  const handleCreate = async (values: any) => {
    try {
      const response = await fetch('/api/ioc-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        toast.success('IOC added to whitelist');
        setShowCreateDialog(false);
        fetchWhitelists();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add IOC to whitelist');
      }
    } catch (error) {
      toast.error('Failed to add IOC to whitelist');
    }
  };

  const handleUpdate = async (values: any) => {
    if (!editingItem) return;

    try {
      const response = await fetch(`/api/ioc-whitelist/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        toast.success('IOC whitelist updated');
        setEditingItem(null);
        fetchWhitelists();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update IOC whitelist');
      }
    } catch (error) {
      toast.error('Failed to update IOC whitelist');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/ioc-whitelist/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('IOC removed from whitelist');
        fetchWhitelists();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to remove IOC from whitelist');
      }
    } catch (error) {
      toast.error('Failed to remove IOC from whitelist');
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/ioc-whitelist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });

      if (response.ok) {
        toast.success(`IOC ${isActive ? 'activated' : 'deactivated'}`);
        fetchWhitelists();
      } else {
        toast.error('Failed to update IOC status');
      }
    } catch (error) {
      toast.error('Failed to update IOC status');
    }
  };

  const handleEdit = (id: string) => {
    const item = whitelists.find((w) => w.id === id);
    if (item) {
      setEditingItem(item);
    }
  };

  const filteredCount = whitelists.length;
  const activeCount = whitelists.filter((w) => w.isActive).length;

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">IOC Whitelist</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage whitelisted Indicators of Compromise to exclude from investigations
          </p>
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            <span>Total: {filteredCount}</span>
            <span>Active: {activeCount}</span>
            <span>Inactive: {filteredCount - activeCount}</span>
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add IOC
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="username">Username</SelectItem>
            <SelectItem value="hash">Hash</SelectItem>
            <SelectItem value="filename">Filename</SelectItem>
            <SelectItem value="ip">IP Address</SelectItem>
            <SelectItem value="domain">Domain</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="true">Active Only</SelectItem>
            <SelectItem value="false">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading whitelists...</div>
      ) : whitelists.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">
            {typeFilter !== 'all' || statusFilter !== 'all'
              ? 'No whitelisted IOCs match your filters'
              : 'No whitelisted IOCs yet'}
          </p>
          {typeFilter === 'all' && statusFilter === 'all' && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First IOC
            </Button>
          )}
        </div>
      ) : (
        <WhitelistTable
          whitelists={whitelists}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
        />
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add IOC to Whitelist</DialogTitle>
            <DialogDescription>
              Add an Indicator of Compromise that should be excluded from security investigations
            </DialogDescription>
          </DialogHeader>
          <WhitelistForm onSubmit={handleCreate} submitLabel="Add to Whitelist" />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Whitelisted IOC</DialogTitle>
            <DialogDescription>
              Update the details for this whitelisted indicator
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <WhitelistForm
              initialData={{
                type: editingItem.type as any,
                value: editingItem.value,
                reason: editingItem.reason || '',
                addedBy: editingItem.addedBy || '',
                isActive: editingItem.isActive,
              }}
              onSubmit={handleUpdate}
              submitLabel="Update Whitelist"
            />
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
