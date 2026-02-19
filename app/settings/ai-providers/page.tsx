'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProviderCard } from '@/components/ai-providers/provider-card';
import { ProviderForm } from '@/components/ai-providers/provider-form';
import { toast } from 'sonner';

interface AIProvider {
  id: string;
  name: string;
  type: string;
  modelName: string;
  apiKey: string | null;
  baseUrl: string | null;
  temperature: number | null;
  maxTokens: number | null;
  isDefault: boolean;
  isActive: boolean;
}

export default function AIProvidersPage() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/ai-providers');
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers);
      }
    } catch (error) {
      toast.error('Failed to fetch AI providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      const response = await fetch('/api/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        toast.success('AI provider created successfully');
        setShowCreateDialog(false);
        fetchProviders();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create provider');
      }
    } catch (error) {
      toast.error('Failed to create provider');
    }
  };

  const handleUpdate = async (values: any) => {
    if (!editingProvider) return;

    try {
      const response = await fetch(`/api/ai-providers/${editingProvider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        toast.success('AI provider updated successfully');
        setEditingProvider(null);
        fetchProviders();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update provider');
      }
    } catch (error) {
      toast.error('Failed to update provider');
    }
  };

  const handleTest = async (id: string) => {
    try {
      const response = await fetch(`/api/ai-providers/${id}/test`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Connection successful');
        return data;
      } else {
        toast.error(data.error || 'Test failed');
        return data;
      }
    } catch (error: any) {
      toast.error(error.message || 'Test failed');
      return { success: false, message: error.message };
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/ai-providers/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('AI provider deleted successfully');
        fetchProviders();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to delete provider');
      }
    } catch (error) {
      toast.error('Failed to delete provider');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/ai-providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });

      if (response.ok) {
        toast.success('Default provider updated');
        fetchProviders();
      } else {
        toast.error('Failed to set default provider');
      }
    } catch (error) {
      toast.error('Failed to set default provider');
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">AI Providers</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage AI model providers for investigation agents
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Provider
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading providers...</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">No AI providers configured yet</p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Provider
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onTest={handleTest}
              onDelete={handleDelete}
              onEdit={(id) => setEditingProvider(providers.find((p) => p.id === id) || null)}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add AI Provider</DialogTitle>
            <DialogDescription>
              Configure a new AI model provider for your investigation agents
            </DialogDescription>
          </DialogHeader>
          <ProviderForm onSubmit={handleCreate} submitLabel="Create Provider" />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingProvider} onOpenChange={(open) => !open && setEditingProvider(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit AI Provider</DialogTitle>
            <DialogDescription>Update the configuration for this provider</DialogDescription>
          </DialogHeader>
          {editingProvider && (
            <ProviderForm
              initialData={{
                name: editingProvider.name,
                providerType: editingProvider.type as any,
                apiKey: editingProvider.apiKey || '',
                baseUrl: editingProvider.baseUrl || '',
                modelName: editingProvider.modelName,
                temperature: editingProvider.temperature || 0.1,
                maxTokens: editingProvider.maxTokens || 4096,
                isDefault: editingProvider.isDefault,
              }}
              onSubmit={handleUpdate}
              submitLabel="Update Provider"
            />
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
