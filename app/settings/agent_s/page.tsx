'use client';

import yaml from 'js-yaml';
import { useEffect, useState } from 'react';
import { Filter, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AddAgentButton } from '@/components/agent_s/AddAgentButton';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

interface Agent {
  fileName: string;
  name: string;
  version: string;
  type: string;
  enabled: boolean;
  domain: string;
  description: string;
  rawContent: string;
  error?: boolean;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/agent_s');
      if (!response.ok) throw new Error('Failed to fetch agents');
      
      const data = await response.json();

      // Parse the YAML content for each agent right in the browser
      const parsedAgents = data.map((item: any): Agent => {
        try {
          const parsed = yaml.load(item.content) as any;
          return {
            fileName: item.fileName,
            name: parsed.name || item.fileName,
            version: parsed.version || 'Unknown',
            type: parsed.type || 'Unknown',
            enabled: parsed.enabled ?? false,
            domain: parsed.domain || 'Unknown',
            description: parsed.description || 'No description provided.',
            rawContent: item.content
          };
        } catch (e) {
          return {
            fileName: item.fileName,
            name: item.fileName,
            version: 'N/A',
            type: 'error',
            enabled: false,
            domain: 'error',
            description: 'Failed to parse YAML configuration.',
            rawContent: item.content,
            error: true
          };
        }
      });

      setAgents(parsedAgents);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // Filter logic
  const filteredAgents = agents.filter((agent) => {
    const matchesType = typeFilter === 'all' || agent.type === typeFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'true' && agent.enabled) ||
      (statusFilter === 'false' && !agent.enabled);

    return matchesType && matchesStatus;
  });

  const activeCount = agents.filter((a) => a.enabled).length;
  
  // Get dynamic unique types for the filter dropdown
  const uniqueTypes = Array.from(new Set(agents.map(a => a.type).filter(t => t !== 'error')));

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Agents</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              View and manage your specialist threat hunting agents here
            </p>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span>Total: {agents.length}</span>
              <span>Active: {activeCount}</span>
              <span>Inactive: {agents.length - activeCount}</span>
            </div>
          </div>
	<div><AddAgentButton/></div>
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
              {uniqueTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
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
          <div className="text-center py-12 text-muted-foreground animate-pulse">Loading agents...</div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">
              No agents match your current filters.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((agent) => (
                  <TableRow key={agent.fileName} className={agent.error ? "bg-red-500/10" : ""}>
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {agent.name}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 max-w-sm mt-0.5" title={agent.description}>
                        {agent.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {agent.domain.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {agent.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      v{agent.version}
                    </TableCell>
                    <TableCell>
                      <Badge variant={agent.enabled ? "default" : "destructive"}>
                        {agent.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedAgent(agent)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View YAML
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* View Details Dialog */}
        <Dialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedAgent?.name} 
                <Badge variant={selectedAgent?.enabled ? "default" : "destructive"}>
                  {selectedAgent?.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {selectedAgent?.fileName}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto bg-muted rounded-md p-4 mt-2">
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {selectedAgent?.rawContent}
              </pre>
            </div>

            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setSelectedAgent(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}