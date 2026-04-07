'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
const Cycles = {
  min: 1,
  max: 20,
};
// Predefined focus areas
const FOCUS_AREAS = [
  { id: 'rootkit', label: 'Rootkit Detection', description: 'Hidden malware and persistence' },
  { id: 'brute_force', label: 'Brute Force Attacks', description: 'Password guessing attempts' },
  { id: 'aws_iam_abuse', label: 'AWS IAM Abuse', description: 'Cloud identity misuse' },
  { id: 'data_exfiltration', label: 'Data Exfiltration', description: 'Unauthorized data transfers' },
  { id: 'lateral_movement', label: 'Lateral Movement', description: 'Network propagation' },
  { id: 'privilege_escalation', label: 'Privilege Escalation', description: 'Permission elevation' },
  { id: 'command_control', label: 'Command & Control', description: 'C2 communications' },
  { id: 'malware', label: 'Malware Execution', description: 'Malicious code detection' },
  { id: 'insider_threat', label: 'Insider Threats', description: 'Internal abuse patterns' },
  { id: 'prompt_injection', label: 'Prompt Injections', description: 'Malicious LLM prompting' },
  { id: 'supply_chain', label: 'Supply Chain', description: 'Third-party compromises' },
];

interface ThreatHuntFormProps {
  onSuccess: () => void;
}

export function ThreatHuntForm({ onSuccess }: ThreatHuntFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>([]);
  const [ctiContext, setCtiContext] = useState('');
  const [timeRangePreset, setTimeRangePreset] = useState('last_7d');
  const [minSeverity, setMinSeverity] = useState('medium');
  const [autoCreate, setAutoCreate] = useState(true);
  const [autoStart, setAutoStart] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: {
      maxCycles: 3,
      customEarliest: '',
      customLatest: '',
      customEarliestDate: '',
      customLatestDate: '',
    },
  });

  const handleTimeRangeChange = useCallback((value: string) => {
    setTimeRangePreset(value);
  }, []);

  const handleSeverityChange = useCallback((value: string) => {
    setMinSeverity(value);
  }, []);

  const handleAutoCreateChange = useCallback((checked: boolean) => {
    setAutoCreate(checked);
    // If turning off auto-create, also turn off auto-start
    if (!checked) {
      setAutoStart(false);
    }
  }, []);

  const handleAutoStartChange = useCallback((checked: boolean) => {
    setAutoStart(checked);
  }, []);

  const onSubmit = async (data: any) => {
    setLoading(true);

    try {
      // Determine time range based on preset or custom values
      let timeRange = undefined;
      if (timeRangePreset === 'custom') {
        // Handle datetime inputs if provided
        if (data.customEarliestDate || data.customLatestDate) {
          const formatDateTime = (dateStr: string) => {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            // Format as MM/DD/YYYY:HH:MM:SS for Splunk
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${month}/${day}/${year}:${hours}:${minutes}:${seconds}`;
          };

          timeRange = {
            earliest: data.customEarliestDate ? formatDateTime(data.customEarliestDate) : data.customEarliest || '0',
            latest: data.customLatestDate ? formatDateTime(data.customLatestDate) : data.customLatest || 'now',
          };
        } else if (data.customEarliest || data.customLatest) {
          // Fallback to relative time strings
          timeRange = {
            earliest: data.customEarliest || '0',
            latest: data.customLatest || 'now',
          };
        }
      } else if (timeRangePreset !== 'all_time') {
        const presets: Record<string, { earliest: string; latest: string }> = {
          last_1h: { earliest: '-1h', latest: 'now' },
          last_24h: { earliest: '-24h', latest: 'now' },
          last_7d: { earliest: '-7d', latest: 'now' },
          last_30d: { earliest: '-30d', latest: 'now' },
          last_90d: { earliest: '-90d', latest: 'now' },
		  last_ytd: { earliest: `01/01/${new Date().getFullYear()}:00:00:00`, latest: 'now'},
        };
        timeRange = presets[timeRangePreset];
      }

      const payload = {
        maxCycles: parseInt(data.maxCycles) || 3,
        minSeverityForInvestigation: minSeverity,
        autoCreateInvestigations: autoCreate,
        autoStartInvestigations: autoStart,
        timeRange,
        focusAreas: selectedFocusAreas.length > 0 ? selectedFocusAreas : undefined,
        ctiContext: ctiContext.trim() || undefined,
      };

      const res = await fetch('/api/threat-hunts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Failed to start threat hunt');
      }

      toast.success('Threat hunt started successfully!');
      onSuccess();
    } catch (error) {
      console.error('Error starting threat hunt:', error);
      toast.error('Failed to start threat hunt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Time Range */}
      <div className="space-y-3">
        <Label>Time Range</Label>
        <Select value={timeRangePreset} onValueChange={handleTimeRangeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last_1h">Last Hour</SelectItem>
            <SelectItem value="last_24h">Last 24 Hours</SelectItem>
            <SelectItem value="last_7d">Last 7 Days</SelectItem>
            <SelectItem value="last_30d">Last 30 Days</SelectItem>
            <SelectItem value="last_90d">Last 90 Days</SelectItem>
			<SelectItem value="last_ytd">Year-To-Date</SelectItem>
            <SelectItem value="all_time">All Time</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>

        {timeRangePreset === 'custom' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Earliest (Date/Time)</Label>
                <Input
                  {...register('customEarliestDate')}
                  type="datetime-local"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Latest (Date/Time)</Label>
                <Input
                  {...register('customLatestDate')}
                  type="datetime-local"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="text-center text-xs text-muted-foreground">OR</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Earliest (Relative, e.g., -30d, 0)</Label>
                <Input
                  {...register('customEarliest')}
                  placeholder="-30d"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Latest (Relative, e.g., now, @d)</Label>
                <Input
                  {...register('customLatest')}
                  placeholder="now"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Focus Areas */}
      <div className="space-y-3">
        <div>
          <Label>Focus Areas (Optional)</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Select specific threat categories to prioritize. Leave empty to hunt all areas.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto p-3 border rounded-md">
          {FOCUS_AREAS.map((area) => (
            <div
              key={area.id}
              className="flex items-start space-x-2 p-2 rounded hover:bg-accent"
            >
              <Checkbox
                id={`focus-${area.id}`}
                checked={selectedFocusAreas.includes(area.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedFocusAreas((prev) => [...prev, area.id]);
                  } else {
                    setSelectedFocusAreas((prev) => prev.filter((id) => id !== area.id));
                  }
                }}
              />
              <label
                htmlFor={`focus-${area.id}`}
                className="flex-1 cursor-pointer"
              >
                <div className="text-sm font-medium">{area.label}</div>
                <div className="text-xs text-muted-foreground">{area.description}</div>
              </label>
            </div>
          ))}
        </div>
        {selectedFocusAreas.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {selectedFocusAreas.length} area{selectedFocusAreas.length > 1 ? 's' : ''} selected
          </div>
        )}
      </div>

      {/* Cyber Threat Intelligence */}
      <div className="space-y-3">
        <div>
          <Label htmlFor="ctiContext">Cyber Threat Intelligence (Optional)</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Provide CTI context, IOCs, TTPs, or threat actor information to guide the threat hunt.
            The AI agent will prioritize hunting for these specific threats.
          </p>
        </div>
        <Textarea
  id="ctiContext"
  value={ctiContext}
  onChange={(e) => setCtiContext(e.target.value)}
  placeholder={`Example:
- Known APT29 TTPs: Living-off-the-land binaries, PowerShell obfuscation
- IOCs: 192.0.2.1, virus.evil.com, c3ab8ff13720e8ad9047dd39466b3c89
- Campaign: Operation XYZ targeting financial sector
- Focus on AWS Lambda misuse and data exfiltration to S3`}
  className="font-mono text-sm min-h-[200px]"
/>
        {ctiContext.trim() && (
          <div className="text-xs text-muted-foreground">
            {ctiContext.trim().length} characters of CTI context provided
          </div>
        )}
      </div>

      {/* Hunt Cycles */}
      <div className="space-y-3">
        <Label htmlFor="maxCycles">Hunt Cycles (minimum {Cycles.min}, maximum {Cycles.max})</Label>
        <Input
          id="maxCycles"
          type="number"
          {...register('maxCycles')}
          min={1}
          max={20}
        />
        <p className="text-xs text-muted-foreground">
          Each cycle generates a new autonomous hunt plan
        </p>
      </div>

      {/* Investigation Settings */}
      <div className="space-y-3">
        <Label>Auto-Investigation Settings</Label>

        <div className="space-y-3 p-3 border rounded-md">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="autoCreate"
              checked={autoCreate}
              onCheckedChange={(checked) => handleAutoCreateChange(checked as boolean)}
            />
            <Label htmlFor="autoCreate" className="text-sm font-normal cursor-pointer">
              Automatically create investigations for findings
            </Label>
          </div>

          {autoCreate && (
            <div className="flex items-center space-x-2 ml-6">
              <Checkbox
                id="autoStart"
                checked={autoStart}
                onCheckedChange={(checked) => handleAutoStartChange(checked as boolean)}
              />
              <Label htmlFor="autoStart" className="text-sm font-normal cursor-pointer">
                Automatically start created investigations
              </Label>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="minSeverity" className="text-sm">
              Minimum Severity for Auto-Investigation
            </Label>
            <Select value={minSeverity} onValueChange={handleSeverityChange}>
              <SelectTrigger id="minSeverity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low and above</SelectItem>
                <SelectItem value="medium">Medium and above</SelectItem>
                <SelectItem value="high">High and above</SelectItem>
                <SelectItem value="critical">Critical only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="submit" disabled={loading}>
          {loading ? 'Starting Hunt...' : 'Start Threat Hunt'}
        </Button>
      </div>
    </form>
  );
}
