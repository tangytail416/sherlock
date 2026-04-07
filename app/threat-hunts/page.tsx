'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Eye, Plus, Pause, Play, Trash2, Square, IterationCw } from 'lucide-react';
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
import { ThreatHuntForm } from '@/components/threat-hunting/hunt-form';
import { useColorConfigs, getInvestigationStatusClasses, getSeverityClasses } from '@/lib/hooks/use-colors';
import { cn } from '@/lib/utils';

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

export default function ThreatHuntsPage() {
  const colors = useColorConfigs();
  const [hunts, setHunts] = useState<ThreatHunt[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const handleToggleHunt = async (id: string, currentStatus: string) => {
    try {
      if (currentStatus === 'active') {
        await fetch(`/api/threat-hunts/${id}/pause`, { method: 'POST' });
      } else if (currentStatus === 'paused') {
        await fetch(`/api/threat-hunts/${id}/resume`, { method: 'POST' });
      }
      fetchHunts();
    } catch (error) {
      console.error('Error toggling hunt status:', error);
    }
  };

  const handleStopHunt = async (id: string) => {
    try {
      await fetch(`/api/threat-hunts/${id}/stop`, { method: 'POST' });
      fetchHunts();
    } catch (error) {
      console.error('Error stopping hunt:', error);
    }
  };
  
  const handleRestartHunt = async (id: string) => {
    try {
      await fetch(`/api/threat-hunts/${id}/restart`, { method: 'POST' });
      fetchHunts();
    } catch (error) {
      console.error('Error restarting hunt:', error);
    }
  };
  
  const handleDeleteClick = (id: string) => {
    setSelectedId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedId) return;

    try {
      const res = await fetch(`/api/threat-hunts/${selectedId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteDialogOpen(false);
        setSelectedId(null);
        fetchHunts();
      } else {
        const data = await res.json();
        console.error('Delete failed:', data.error || 'Unknown error');
        alert(`Failed to delete hunt: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting hunt:', error);
      alert('Error deleting hunt. Check console for details.');
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
                    <Badge 
                      variant="outline" 
                      className={cn("border capitalize", getInvestigationStatusClasses(hunt.status, colors))}
                      suppressHydrationWarning
                    >
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
                        <Badge variant="outline" className={cn("text-xs border", getSeverityClasses('critical', colors))}>
                          {hunt.findingsSummary.critical} Critical
                        </Badge>
                      )}
                      {hunt.findingsSummary.high > 0 && (
                        <Badge variant="outline" className={cn("text-xs border", getSeverityClasses('high', colors))}>
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
					{hunt.status !== 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestartHunt(hunt.id)}
                        >
                          <IterationCw className="mr-1 h-3 w-3" />
                          Restart
                        </Button>
                      )}
                      <Link href={`/threat-hunts/${hunt.id}`}>
                        <Button variant="outline" size="sm" className="w-[90px]">
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                      </Link>
                      {hunt.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-[90px]"
                          onClick={() => handleToggleHunt(hunt.id, hunt.status)}
                        >
                          <Pause className="mr-1 h-3 w-3" />
                          Pause
                        </Button>
                      )}
                      {hunt.status === 'paused' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-[90px]"
                            onClick={() => handleToggleHunt(hunt.id, hunt.status)}
                          >
                            <Play className="mr-1 h-3 w-3" />
                            Resume
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-[90px]"
                            onClick={() => handleStopHunt(hunt.id)}
                          >
                            <Square className="mr-1 h-3 w-3" />
                            Stop
                          </Button>
                        </>
                      )}
                      {(hunt.status === 'completed' || hunt.status === 'failed') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-[90px]"
                          onClick={() => handleDeleteClick(hunt.id)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this threat hunt and all its findings. This action cannot be undone.
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
    </div>
  );
}