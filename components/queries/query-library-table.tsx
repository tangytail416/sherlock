'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Search as SearchIcon, Play, TrendingUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SavedQuery = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  severity: string | null;
  isAutomated: boolean;
  findingsCount: number;
  executionsCount: number;
  lastExecutedAt: Date | null;
  createdAt: Date;
  _count?: {
    executions: number;
    threatFindings: number;
  };
};

interface QueryLibraryTableProps {
  queries: SavedQuery[];
  onExecute?: (queryId: string) => void;
}

const categoryColors = {
  authentication: 'default',
  endpoint: 'default',
  network: 'default',
  privilege_escalation: 'destructive',
  data_exfiltration: 'destructive',
  malware: 'destructive',
  lateral_movement: 'destructive',
  persistence: 'default',
  defense_evasion: 'default',
  discovery: 'secondary',
  other: 'secondary',
} as const;

const severityColors = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
} as const;

const categoryLabels = {
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
} as const;

export function QueryLibraryTable({ queries, onExecute }: QueryLibraryTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const filteredQueries = queries.filter((query) => {
    const matchesSearch =
      query.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      query.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      query.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || query.category === categoryFilter;
    const matchesSource =
      sourceFilter === 'all' ||
      (sourceFilter === 'automated' && query.isAutomated) ||
      (sourceFilter === 'manual' && !query.isAutomated);

    return matchesSearch && matchesCategory && matchesSource;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search queries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="authentication">Authentication</SelectItem>
            <SelectItem value="endpoint">Endpoint</SelectItem>
            <SelectItem value="network">Network</SelectItem>
            <SelectItem value="privilege_escalation">Privilege Escalation</SelectItem>
            <SelectItem value="data_exfiltration">Data Exfiltration</SelectItem>
            <SelectItem value="malware">Malware</SelectItem>
            <SelectItem value="lateral_movement">Lateral Movement</SelectItem>
            <SelectItem value="persistence">Persistence</SelectItem>
            <SelectItem value="defense_evasion">Defense Evasion</SelectItem>
            <SelectItem value="discovery">Discovery</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="automated">Agent-Generated</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead className="text-right">Findings</TableHead>
              <TableHead className="text-right">Executions</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredQueries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No queries found
                </TableCell>
              </TableRow>
            ) : (
              filteredQueries.map((query) => (
                <TableRow key={query.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/queries/${query.id}`}
                      className="hover:underline text-foreground"
                    >
                      {query.name}
                    </Link>
                    {query.description && (
                      <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {query.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={categoryColors[query.category as keyof typeof categoryColors] || 'secondary'}
                    >
                      {categoryLabels[query.category as keyof typeof categoryLabels] || query.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={query.isAutomated ? 'default' : 'outline'}>
                      {query.isAutomated ? 'Agent' : 'Manual'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {query.severity ? (
                      <Badge
                        variant={severityColors[query.severity as keyof typeof severityColors]}
                      >
                        {query.severity}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {query.findingsCount > 0 ? (
                      <div className="flex items-center justify-end gap-1">
                        <TrendingUp className="h-3 w-3 text-primary" />
                        <span className="font-medium">{query.findingsCount}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{query.executionsCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {query.lastExecutedAt
                      ? formatDistanceToNow(new Date(query.lastExecutedAt), { addSuffix: true })
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {onExecute && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onExecute(query.id)}
                          title="Execute query"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/queries/${query.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {filteredQueries.length} of {queries.length} queries
      </div>
    </div>
  );
}
