'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

const formSchema = z.object({
  type: z.enum(['username', 'hash', 'filename', 'ip', 'domain']),
  value: z.string().min(1, 'Value is required'),
  reason: z.string().optional(),
  addedBy: z.string().optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface WhitelistFormProps {
  onSubmit: (values: FormValues) => void | Promise<void>;
  initialData?: Partial<FormValues>;
  submitLabel?: string;
}

const IOC_TYPES = [
  { value: 'username', label: 'Username', description: 'User account names' },
  { value: 'hash', label: 'Hash', description: 'File hashes (MD5, SHA256, etc.)' },
  { value: 'filename', label: 'Filename', description: 'File names or paths' },
  { value: 'ip', label: 'IP Address', description: 'IPv4 or IPv6 addresses' },
  { value: 'domain', label: 'Domain', description: 'Domain names or URLs' },
];

export function WhitelistForm({ onSubmit, initialData, submitLabel = 'Add to Whitelist' }: WhitelistFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: initialData?.type || 'username',
      value: initialData?.value || '',
      reason: initialData?.reason || '',
      addedBy: initialData?.addedBy || '',
      isActive: initialData?.isActive ?? true,
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
      if (!initialData) {
        form.reset();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>IOC Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select IOC type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {IOC_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>The type of indicator to whitelist</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Value</FormLabel>
              <FormControl>
                <Input placeholder="e.g., admin, 192.168.1.1, example.com" {...field} />
              </FormControl>
              <FormDescription>
                The actual value of the IOC (case-sensitive)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reason (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Why is this IOC being whitelisted?"
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Document why this IOC should be excluded from investigations
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="addedBy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Added By (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., security-team@company.com" {...field} />
              </FormControl>
              <FormDescription>Who is adding this whitelist entry</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active</FormLabel>
                <FormDescription>
                  Enable or disable this whitelist entry
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
