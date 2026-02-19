'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SavedQuery {
  id: string;
  name: string;
  description: string | null;
  category: string;
  severity: string | null;
  findingsCount: number;
}

interface SavedQuerySelectorProps {
  selectedQueryIds: string[];
  onSelectionChange: (queryIds: string[]) => void;
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

export function SavedQuerySelector({
  selectedQueryIds,
  onSelectionChange,
}: SavedQuerySelectorProps) {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQueries();
  }, []);

  const fetchQueries = async () => {
    try {
      const response = await fetch('/api/queries?limit=100');
      if (!response.ok) throw new Error('Failed to fetch queries');
      const data = await response.json();
      setQueries(data.queries || []);
    } catch (error) {
      console.error('Error fetching queries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (queryId: string) => {
    if (selectedQueryIds.includes(queryId)) {
      onSelectionChange(selectedQueryIds.filter((id) => id !== queryId));
    } else {
      onSelectionChange([...selectedQueryIds, queryId]);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading queries...
      </div>
    );
  }

  if (queries.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No saved queries available. Queries will be generated automatically by the agent.
      </div>
    );
  }

  return (
    <ScrollArea className="h-64 border rounded-md p-3">
      <div className="space-y-2">
        {queries.map((query) => (
          <div
            key={query.id}
            className="flex items-start space-x-2 p-2 rounded hover:bg-accent"
          >
            <Checkbox
              id={`query-${query.id}`}
              checked={selectedQueryIds.includes(query.id)}
              onCheckedChange={() => handleToggle(query.id)}
            />
            <label
              htmlFor={`query-${query.id}`}
              className="flex-1 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{query.name}</span>
                <Badge variant="outline" className="text-xs">
                  {categoryLabels[query.category] || query.category}
                </Badge>
                {query.findingsCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {query.findingsCount} findings
                  </Badge>
                )}
              </div>
              {query.description && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {query.description}
                </div>
              )}
            </label>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
