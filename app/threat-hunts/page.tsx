'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Target, Plus, Pause, Play, Trash, Square, Eye} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ThreatHuntForm } from '@/components/threat-hunting/hunt-form';

interface ThreatHunt {
  id: string;
  status: string;
  startedAt: string;
  lastRunAt: string | null;
  completedAt: string | null;
  findingsCount: number;
  cyclesRun: number;
  config: any;
  findingsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

const statusColors = {
  active: 'default',
  completed: 'secondary',
  failed: 'destructive',
  paused: 'outline',
} as const;

export default function ThreatHuntsPage() {
  const [hunts, setHunts] = useState<ThreatHunt[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchHunts = async () => {
    try {
      const res = await fetch('/api/threat-hunts');
      const data = await res.json();
      setHunts(data.hunts || []);
    } catch (error) {
      console.error('Error fetching threat hunts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHunts();
    const interval = setInterval(fetchHunts, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleStopHunt = async (id: string) => {
    try {
      await fetch(`/api/threat-hunts/${id}/sotp`, { method: 'POST' });
      fetchHunts();
    } catch (error) {
      console.error('Error stopping hunt:', error);
    }
  };
  const handleDeleteHunt = async (id: string) => {
  const confirmed = confirm('DELETE HUNT??????????');

  if (!confirmed) return;
  //alert(id);

  try {
    await fetch(`/api/threat-hunts/${id}`, {
      method: 'DELETE',
    });
    fetchHunts();
  } catch (error) {
    console.error('Error deleting hunt:', error);
  }
};






  const handleHuntCreated = () => {
    setDialogOpen(false);
    fetchHunts();
  };

  if (loading) {
    return <div className="container mx-auto p-4 md:p-6"><div className="p-8">Loading...</div></div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Threat Hunting</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Autonomous AI-powered threat hunting across your environment
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Hunt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Start New Threat Hunt</DialogTitle>
              <DialogDescription>
                Configure and launch an autonomous threat hunting operation
              </DialogDescription>
            </DialogHeader>
            <ThreatHuntForm onSuccess={handleHuntCreated} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Cycles</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead>Critical/High</TableHead>
              <TableHead>Time Range</TableHead>
              <TableHead>Focus Areas</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hunts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No threat hunts yet. Start your first hunt to discover threats.
                </TableCell>
              </TableRow>
            ) : (
              hunts.map((hunt) => (
				
                <TableRow key={hunt.id}>
                  <TableCell>
                    <Badge variant={statusColors[hunt.status as keyof typeof statusColors] || 'default'}>
                      {hunt.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {hunt.cyclesRun}/{hunt.config.maxCycles || 10}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{hunt.findingsCount}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {hunt.findingsSummary.critical > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {hunt.findingsSummary.critical} Critical
                        </Badge>
                      )}
                      {hunt.findingsSummary.high > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {hunt.findingsSummary.high} High
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {hunt.config.timeRange ? (
                      <code className="text-xs">
                        {hunt.config.timeRange.earliest} → {hunt.config.timeRange.latest}
                      </code>
                    ) : (
                      <span className="text-muted-foreground text-xs">All time</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {hunt.config.focusAreas && hunt.config.focusAreas.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {hunt.config.focusAreas.slice(0, 2).map((area: string) => (
                          <Badge key={area} variant="outline" className="text-xs">
                            {area}
                          </Badge>
                        ))}
                        {hunt.config.focusAreas.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{hunt.config.focusAreas.length - 2}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">All areas</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(hunt.startedAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/threat-hunts/${hunt.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                      </Link>
                      {hunt.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStopHunt(hunt.id)}
                        >
                          <Square className="mr-1 h-3 w-3" />
                          Stop
                        </Button>
                      )}
					  {hunt.status !== 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteHunt(hunt.id)}
                        >
                          <Trash className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </div>
    </div>
  );
}
