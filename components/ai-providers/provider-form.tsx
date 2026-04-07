'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox'; // Checkbox is imported here

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  providerType: z.enum(['glm', 'openai', 'azure', 'openrouter']),
  // Updated so validation doesn't fail when the box is checked and field is empty
  apiKey: z.string().optional().or(z.literal('')), 
  baseUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  modelName: z.string().min(1, 'Model name is required'),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive(),
  isDefault: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface ProviderFormProps {
  initialData?: Partial<FormValues>;
  onSubmit: (values: FormValues) => Promise<void>;
  submitLabel?: string;
}

const PROVIDER_DEFAULTS = {
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-4-plus',
    description: 'GLM-4 by Zhipu AI (Chinese LLM)',
  },
  openai: {
    baseUrl: '',
    modelName: 'gpt-4',
    description: 'OpenAI GPT models',
  },
  azure: {
    baseUrl: '',
    modelName: 'gpt-4',
    description: 'Azure OpenAI Service',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    modelName: 'anthropic/claude-3.5-sonnet',
    description: 'OpenRouter multi-model proxy',
  },
};

export function ProviderForm({ initialData, onSubmit, submitLabel = 'Save' }: ProviderFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isApiKeyDisabled, setIsApiKeyDisabled] = useState(false); // Track checkbox state

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      providerType: initialData?.providerType || 'glm',
      apiKey: initialData?.apiKey || '',
      baseUrl: initialData?.baseUrl || PROVIDER_DEFAULTS.glm.baseUrl,
      modelName: initialData?.modelName || PROVIDER_DEFAULTS.glm.modelName,
      temperature: typeof initialData?.temperature === 'number' ? initialData.temperature : 0.1,
      maxTokens: typeof initialData?.maxTokens === 'number' ? initialData.maxTokens : 4096,
      isDefault: initialData?.isDefault || false,
    },
  });

  const handleProviderTypeChange = (providerType: 'glm' | 'openai' | 'azure' | 'openrouter') => {
    const defaults = PROVIDER_DEFAULTS[providerType];
    form.setValue('baseUrl', defaults.baseUrl);
    form.setValue('modelName', defaults.modelName);
  };

  async function handleSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      await onSubmit(values);
    } finally {
      setIsLoading(false);
    }
  }

  const selectedProvider = form.watch('providerType');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., GLM-4 Production" {...field} />
              </FormControl>
              <FormDescription>A friendly name for this provider configuration</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="providerType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider Type</FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);
                  handleProviderTypeChange(value as any);
                }}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(PROVIDER_DEFAULTS).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex flex-col">
                        <span className="font-medium">{key.toUpperCase()}</span>
                        <span className="text-xs text-muted-foreground">{value.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              {/* Flex container to place the label and checkbox on the same line */}
              <div className="flex items-center justify-between">
                <FormLabel>API Key</FormLabel>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="disable-api-key"
                    checked={isApiKeyDisabled}
                    onCheckedChange={(checked) => {
                      setIsApiKeyDisabled(!!checked);
                      if (checked) {
                        form.setValue('apiKey', ''); // Optionally clear the field when disabled
                        form.clearErrors('apiKey');
                      }
                    }}
                  />
                  <label
                    htmlFor="disable-api-key"
                    className="text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    This is an on-prmise provider
                  </label>
                </div>
              </div>
              <FormControl>
                <Input 
                  type="password" 
                  placeholder="sk-..." 
                  {...field} 
                  disabled={isApiKeyDisabled} // Greys out the input when checked
                />
              </FormControl>
              <FormDescription>Your API key for this provider</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="baseUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Base URL</FormLabel>
              <FormControl>
                <Input placeholder="https://api.openai.com/v1" {...field} />
              </FormControl>
              <FormDescription>
                API endpoint URL (leave empty for OpenAI default)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="modelName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model Name</FormLabel>
              <FormControl>
                <Input placeholder="gpt-4" {...field} />
              </FormControl>
              <FormDescription>
                The model identifier (e.g., gpt-4, glm-4-plus, claude-3.5-sonnet)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="temperature"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Temperature</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" min="0" max="2" {...field} 
                  onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                </FormControl>
                <FormDescription>0.0 - 2.0 (lower = more deterministic)</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maxTokens"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Tokens</FormLabel>
                <FormControl>
                  <Input type="number" step="1" min="1" {...field}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                </FormControl>
                <FormDescription>Maximum response length</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Set as Default</FormLabel>
                <FormDescription>
                  Use this provider by default for new investigations
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}