'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Trash2, Edit, TestTube } from 'lucide-react';
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

interface ProviderCardProps {
  provider: {
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
  };
  onTest: (id: string) => Promise<{ success: boolean; message?: string; details?: any }>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (id: string) => void;
  onSetDefault: (id: string) => Promise<void>;
}

export function ProviderCard({ provider, onTest, onDelete, onEdit, onSetDefault }: ProviderCardProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; details?: any } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(provider.id);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(provider.id);
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleSetDefault = async () => {
    await onSetDefault(provider.id);
  };

  return (
    <>
      <Card className={provider.isDefault ? 'border-primary' : ''}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {provider.name}
                {provider.isDefault && (
                  <Badge variant="default" className="ml-2">
                    Default
                  </Badge>
                )}
                {!provider.isActive && (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {provider.type.toUpperCase()} - {provider.modelName}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Temperature:</span>
                <span className="ml-2 font-medium">{provider.temperature}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Max Tokens:</span>
                <span className="ml-2 font-medium">{provider.maxTokens}</span>
              </div>
              {provider.baseUrl && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Base URL:</span>
                  <span className="ml-2 font-mono text-xs">{provider.baseUrl}</span>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-muted-foreground">API Key:</span>
                <span className="ml-2 font-mono text-xs">{provider.apiKey}</span>
              </div>
            </div>

            {testResult && (
              <div
                className={`rounded-md border p-3 text-sm ${
                  testResult.success
                    ? 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100'
                    : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{testResult.message}</p>
                    {testResult.details && (
                      <div className="mt-2 space-y-1 text-xs opacity-80">
                        {testResult.details.model && <p>Model: {testResult.details.model}</p>}
                        {testResult.details.latency_ms && (
                          <p>Latency: {testResult.details.latency_ms}ms</p>
                        )}
                        {testResult.details.tokens_used && (
                          <p>Tokens: {testResult.details.tokens_used}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleTest} disabled={testing} variant="outline" size="sm">
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                Test Connection
              </Button>

              {!provider.isDefault && (
                <Button onClick={handleSetDefault} variant="outline" size="sm">
                  Set as Default
                </Button>
              )}

              <Button onClick={() => onEdit(provider.id)} variant="outline" size="sm">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>

              <Button
                onClick={() => setShowDeleteDialog(true)}
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete AI Provider</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{provider.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
