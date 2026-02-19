'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const categoryOptions = [
  { value: 'authentication', label: 'Authentication' },
  { value: 'endpoint', label: 'Endpoint' },
  { value: 'network', label: 'Network' },
  { value: 'privilege_escalation', label: 'Privilege Escalation' },
  { value: 'data_exfiltration', label: 'Data Exfiltration' },
  { value: 'malware', label: 'Malware' },
  { value: 'lateral_movement', label: 'Lateral Movement' },
  { value: 'persistence', label: 'Persistence' },
  { value: 'defense_evasion', label: 'Defense Evasion' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'other', label: 'Other' },
];

const severityOptions = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export function CreateQueryForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('other');
  const [severity, setSeverity] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name: '',
      description: '',
      splQuery: '',
      mitreAttack: '',
    },
  });

  const onSubmit = async (data: any) => {
    setLoading(true);

    try {
      const response = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          splQuery: data.splQuery,
          category: category,
          severity: severity || null,
          mitreAttack: data.mitreAttack || null,
          isAutomated: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create query');
      }

      const query = await response.json();
      toast.success('Query created successfully');
      router.push(`/queries/${query.id}`);
    } catch (error: any) {
      console.error('Error creating query:', error);
      toast.error(error.message || 'Failed to create query');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">
          Query Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          {...register('name', { required: 'Query name is required' })}
          placeholder="e.g., Detect Failed SSH Logins"
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder="Describe what this query detects and when to use it"
          rows={3}
        />
      </div>

      {/* SPL Query */}
      <div className="space-y-2">
        <Label htmlFor="splQuery">
          SPL Query <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="splQuery"
          {...register('splQuery', { required: 'SPL query is required' })}
          placeholder="index=main sourcetype=linux_secure action=failure | stats count by user, src_ip"
          rows={6}
          className="font-mono text-sm"
        />
        {errors.splQuery && (
          <p className="text-sm text-destructive">{errors.splQuery.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Enter your Splunk Search Processing Language (SPL) query
        </p>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Severity */}
      <div className="space-y-2">
        <Label htmlFor="severity">Severity (Optional)</Label>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger id="severity">
            <SelectValue placeholder="Select severity" />
          </SelectTrigger>
          <SelectContent>
            {severityOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* MITRE ATT&CK */}
      <div className="space-y-2">
        <Label htmlFor="mitreAttack">MITRE ATT&CK Technique (Optional)</Label>
        <Input
          id="mitreAttack"
          {...register('mitreAttack')}
          placeholder="e.g., T1110, T1078"
        />
        <p className="text-xs text-muted-foreground">
          Enter the MITRE ATT&CK technique ID if applicable
        </p>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/queries')}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Query'}
        </Button>
      </div>
    </form>
  );
}
