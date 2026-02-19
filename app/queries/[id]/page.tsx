'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Edit, Trash, Clock, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QueryStatsCard } from '@/components/queries/query-stats-card';
import { QueryExecutionResults } from '@/components/queries/query-execution-results';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea'; // Ensure this exists or use html textarea
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
  
  // Execution State
  const [executing, setExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<any>(null);
  const [timeRange, setTimeRange] = useState('last_24h');

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editedSpl, setEditedSpl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchQuery();
  }, [params.id]);

  // Update local edit state when query loads
  useEffect(() => {
    if (query) {
      setEditedSpl(query.splQuery);
    }
  }, [query]);

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

  const handleUpdateQuery = async () => {
    setIsSaving(true);
    try {
      // Assuming your API supports PATCH to update details
      const response = await fetch(`/api/queries/${params.id}`, {
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splQuery: editedSpl }),
      });

      if (!response.ok) throw new Error('Failed to update query');
      const updatedQuery = await response.json();
      setQuery((prev) => {
          if (!prev) return null;
          return {
              ...prev,
              ...updatedQuery
          };
      });
      setIsEditing(false);
      toast.success('Query updated successfully');
      
      // Optional: Auto-run after save?
      // executeQuery(); 
    } catch (error) {
      toast.error('Failed to save 676767676767 query changes');
    } finally {
      setIsSaving(false);
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
          // If your backend supports ad-hoc execution without saving, pass splQuery here:
          // splQuery: isEditing ? editedSpl : query?.splQuery 
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

  const deleteQuery = async () => {
    if (!confirm('Are you sure you want to delete this query?')) return;

    try {
      const response = await fetch(`/api/queries/${params.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete query');

      toast.success('Query deleted successfully');

      router.push('/queries');
    } catch (error) {
      toast.error('Failed to delete query');
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
        <Button variant="outline" size="sm" onClick={deleteQuery}>
          <Trash className="h-4 w-4 mr-2" />
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
          
          {/* SPL Query Section with Edit Functionality */}
          <div>
            <div className="flex items-center justify-between mb-2">
                <Label className="text-muted-foreground">SPL Query</Label>
                {!isEditing ? (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Query
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => {
                            setIsEditing(false);
                            setEditedSpl(query.splQuery); // Reset
                        }}>
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleUpdateQuery} disabled={isSaving}>
                            <Save className="h-4 w-4 mr-2" />
                            Save
                        </Button>
                    </div>
                )}
            </div>
            
            {isEditing ? (
                <Textarea 
                    value={editedSpl}
                    onChange={(e) => setEditedSpl(e.target.value)}
                    className="font-mono text-sm min-h-[120px]"
                />
            ) : (
                <pre className="p-4 bg-muted rounded-md overflow-x-auto whitespace-pre-wrap">
                    <code className="text-sm">{query.splQuery}</code>
                </pre>
            )}
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
            <Button onClick={executeQuery} disabled={executing || isEditing}>
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
          {isEditing && (
              <p className="text-xs text-amber-500">
                  * Save your query changes before running execution.
              </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {executionResults && (
        <div className="grid grid-cols-1">
          <div className="w-full overflow-x-auto pb-4">
             <div className="min-w-max"> 
              <QueryExecutionResults
                results={executionResults.results || []}
                executionTimeMs={executionResults.executionTimeMs}
                error={executionResults.error}
              />
            </div>
          </div>
        </div>
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
    </PageLayout>
  );
}