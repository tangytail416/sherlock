'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Edit, Trash2, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QueryStatsCard } from '@/components/queries/query-stats-card';
import { QueryExecutionResults } from '@/components/queries/query-execution-results';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { PageLayout } from '@/components/layout/page-layout';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface QueryDetails {
  id: string;
  name: string;
  description: string | null;
  splQuery: string;
  category: string;
  severity: string | null;
  mitreAttack: string | null;
  isAutomated: boolean;
  findingsCount: number;
  executionsCount: number;
  lastExecutedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  executions: any[];
  threatFindings: any[];
  stats: {
    successRate: number;
    avgExecutionTimeMs: number;
    totalFindings: number;
    totalExecutions: number;
  };
}

const categoryLabels: Record<string, string> = {
  authentication: 'Authentication',
  endpoint: 'Endpoint',
  network: 'Network',
  privilege_escalation: 'Privilege Escalation',
  data_exfiltration: 'Data Exfiltration',
  malware: 'Malware',
  lateral_movement: 'Lateral Movement',
  persistence: 'Persistence',
  defense_evasion: 'Defense Evasion',
  discovery: 'Discovery',
  other: 'Other',
};

export default function QueryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [query, setQuery] = useState<QueryDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<any>(null);
  const [timeRange, setTimeRange] = useState('last_24h');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    splQuery: '',
    category: 'other',
    severity: '',
    mitreAttack: '',
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    fetchQuery();
  }, [params.id]);

  const fetchQuery = async () => {
    try {
      const response = await fetch(`/api/queries/${params.id}`);
      if (!response.ok) throw new Error('Failed to fetch query');
      const data = await response.json();
      setQuery(data);
    } catch (error) {
      toast.error('Failed to load query details');
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async () => {
    setExecuting(true);
    setExecutionResults(null);

    try {
      const timeRangeMap: Record<string, { earliest: string; latest: string }> = {
        last_1h: { earliest: '-1h', latest: 'now' },
        last_24h: { earliest: '-24h', latest: 'now' },
        last_7d: { earliest: '-7d', latest: 'now' },
        last_30d: { earliest: '-30d', latest: 'now' },
      };

      const range = timeRangeMap[timeRange];

      const response = await fetch(`/api/queries/${params.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          earliestTime: range.earliest,
          latestTime: range.latest,
          executedBy: 'user',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute query');
      }

      setExecutionResults(data);
      toast.success(`Query executed in ${data.executionTimeMs}ms`);

      // Refresh query to update stats
      fetchQuery();
    } catch (error: any) {
      toast.error(error.message || 'Execution failed');
      setExecutionResults({ error: error.message });
    } finally {
      setExecuting(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await fetch(`/api/queries/${params.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete query');

      toast.success('Query deleted successfully');
      setDeleteDialogOpen(false);
      router.push('/queries');
    } catch (error) {
      toast.error('Failed to delete query');
    }
  };

  const openEditDialog = () => {
    if (query) {
      setEditForm({
        name: query.name,
        description: query.description || '',
        splQuery: query.splQuery,
        category: query.category,
        severity: query.severity || '',
        mitreAttack: query.mitreAttack || '',
      });
      setEditDialogOpen(true);
    }
  };

  const updateQuery = async () => {
    setEditing(true);
    try {
      const response = await fetch(`/api/queries/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || null,
          splQuery: editForm.splQuery,
          category: editForm.category,
          severity: editForm.severity || null,
          mitreAttack: editForm.mitreAttack || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to update query');

      toast.success('Query updated successfully');
      setEditDialogOpen(false);
      fetchQuery();
    } catch (error) {
      toast.error('Failed to update query');
    } finally {
      setEditing(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading query...</p>
        </div>
      </div>
    );
  }

  if (!query) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Query not found</p>
        </div>
      </div>
    );
  }

  const headerContent = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/queries">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">{query.name}</h1>
          {query.description && (
            <p className="text-muted-foreground text-sm">{query.description}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={openEditDialog}>
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
        <Button variant="outline" size="sm" onClick={handleDeleteClick}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>
    </div>
  );

  return (
    <PageLayout header={headerContent}>
      <div className="space-y-6">

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Query Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-muted-foreground">Category</Label>
              <div className="mt-1">
                <Badge>{categoryLabels[query.category] || query.category}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Source</Label>
              <div className="mt-1">
                <Badge variant={query.isAutomated ? 'default' : 'outline'}>
                  {query.isAutomated ? 'Agent-Generated' : 'Manual'}
                </Badge>
              </div>
            </div>
            {query.severity && (
              <div>
                <Label className="text-muted-foreground">Severity</Label>
                <div className="mt-1">
                  <Badge variant="destructive">{query.severity}</Badge>
                </div>
              </div>
            )}
            {query.mitreAttack && (
              <div>
                <Label className="text-muted-foreground">MITRE ATT&CK</Label>
                <div className="mt-1">
                  <Badge variant="outline">{query.mitreAttack}</Badge>
                </div>
              </div>
            )}
          </div>
          <div>
            <Label className="text-muted-foreground">SPL Query</Label>
            <pre className="mt-2 p-4 bg-muted rounded-md overflow-x-auto">
              <code className="text-sm">{query.splQuery}</code>
            </pre>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <div>
              <Clock className="h-4 w-4 inline mr-1" />
              Created {formatDistanceToNow(new Date(query.createdAt), { addSuffix: true })}
            </div>
            {query.lastExecutedAt && (
              <div>
                <Clock className="h-4 w-4 inline mr-1" />
                Last run {formatDistanceToNow(new Date(query.lastExecutedAt), { addSuffix: true })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <QueryStatsCard stats={query.stats} />

      {/* Execute Query */}
      <Card>
        <CardHeader>
          <CardTitle>Execute Query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="time-range">Time Range</Label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger id="time-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_1h">Last 1 hour</SelectItem>
                  <SelectItem value="last_24h">Last 24 hours</SelectItem>
                  <SelectItem value="last_7d">Last 7 days</SelectItem>
                  <SelectItem value="last_30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={executeQuery} disabled={executing}>
              {executing ? (
                'Executing...'
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Query
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {executionResults && (
        <QueryExecutionResults
          results={executionResults.results || []}
          executionTimeMs={executionResults.executionTimeMs}
          error={executionResults.error}
        />
      )}

      {/* Recent Findings */}
      {query.threatFindings && query.threatFindings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Findings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {query.threatFindings.map((finding: any) => (
                <div
                  key={finding.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div>
                    <p className="font-medium">{finding.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(finding.detectedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge variant="destructive">{finding.severity}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Query</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Query Name *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Query name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Describe what this query detects"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-splQuery">SPL Query *</Label>
              <Textarea
                id="edit-splQuery"
                value={editForm.splQuery}
                onChange={(e) => setEditForm({ ...editForm, splQuery: e.target.value })}
                placeholder="Enter SPL query"
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select 
                value={editForm.category} 
                onValueChange={(value) => setEditForm({ ...editForm, category: value })}
              >
                <SelectTrigger id="edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-severity">Severity</Label>
              <Select 
                value={editForm.severity} 
                onValueChange={(value) => setEditForm({ ...editForm, severity: value })}
              >
                <SelectTrigger id="edit-severity">
                  <SelectValue placeholder="Select severity" />
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
              <Label htmlFor="edit-mitre">MITRE ATT&CK Technique</Label>
              <Input
                id="edit-mitre"
                value={editForm.mitreAttack}
                onChange={(e) => setEditForm({ ...editForm, mitreAttack: e.target.value })}
                placeholder="e.g., T1110, T1078"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={editing}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button 
                onClick={updateQuery} 
                disabled={editing || !editForm.name || !editForm.splQuery}
              >
                {editing ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the query "{query.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}