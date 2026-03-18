'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface TagConfig {
  id: string;
  category: string;
  values: string[];
}

const DEFAULT_TAGS: Omit<TagConfig, 'id'>[] = [
  { category: 'classification', values: ['True Positive', 'False Positive', 'Benign', 'Testing', 'Under Investigation'] },
  { category: 'threatType', values: ['Malware', 'Phishing', 'Ransomware', 'Unauthorized Access', 'Data Exfiltration', 'Suspicious Logon'] },
  { category: 'campaign', values: ['APT29 (Cozy Bear)', 'FIN7', 'APT28 (Fancy Bear)', 'UNC3886', 'Lazarus Group', 'Charming Kitten', 'APT41 (Wicked Panda)'] },
];

const CATEGORY_INFO: Record<string, { title: string; description: string }> = {
  classification: { title: 'Classification', description: 'Classify the investigation outcome' },
  threatType: { title: 'Threat Type', description: 'Type of threat detected' },
  campaign: { title: 'Campaign', description: 'Associated threat campaign' },
};

export default function TagsConfigPage() {
  const [configs, setConfigs] = useState<TagConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTags, setNewTags] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/tag-config');
      if (response.ok) {
        const data = await response.json();
        setConfigs(data);
      }
    } catch (error) {
      console.error('Failed to fetch tag configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryValues = (category: string): string[] => {
    const config = configs.find((c) => c.category === category);
    return config?.values || DEFAULT_TAGS.find((d) => d.category === category)?.values || [];
  };

  const handleAddTag = (category: string) => {
    const tag = newTags[category]?.trim();
    if (!tag) return;

    const currentValues = getCategoryValues(category);
    if (currentValues.includes(tag)) {
      toast.error('Tag already exists');
      return;
    }

    const updatedValues = [...currentValues, tag];
    saveConfig(category, updatedValues);
    setNewTags({ ...newTags, [category]: '' });
  };

  const handleRemoveTag = (category: string, tagToRemove: string) => {
    const currentValues = getCategoryValues(category);
    const updatedValues = currentValues.filter((t) => t !== tagToRemove);
    saveConfig(category, updatedValues);
  };

  const saveConfig = async (category: string, values: string[]) => {
    setSaving(true);
    try {
      const response = await fetch('/api/tag-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, values }),
      });
      if (response.ok) {
        toast.success('Tags saved');
        fetchConfigs();
      } else {
        toast.error('Failed to save tags');
      }
    } catch (error) {
      toast.error('Failed to save tags');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async (category: string) => {
    const defaultConfig = DEFAULT_TAGS.find((d) => d.category === category);
    if (defaultConfig) {
      await saveConfig(category, defaultConfig.values);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tags Configuration</h1>
        <p className="text-muted-foreground">
          Manage investigation tags for classification, threat types, and campaigns
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {DEFAULT_TAGS.map((defaultConfig) => {
          const category = defaultConfig.category;
          const info = CATEGORY_INFO[category];
          const values = getCategoryValues(category);

          return (
            <Card key={category} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{info.title}</CardTitle>
                    <CardDescription>{info.description}</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResetToDefault(category)}
                    disabled={saving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="flex flex-wrap gap-2">
                  {values.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="flex items-center gap-1 pr-1"
                    >
                      {tag}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-transparent"
                        onClick={() => handleRemoveTag(category, tag)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                  {values.length === 0 && (
                    <span className="text-sm text-muted-foreground">No tags</span>
                  )}
                </div>
                
                <div className="flex gap-2 mt-4">
                  <Input
                    placeholder={`Add ${info.title.toLowerCase()}...`}
                    value={newTags[category] || ''}
                    onChange={(e) => setNewTags({ ...newTags, [category]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag(category);
                      }
                    }}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleAddTag(category)}
                    disabled={saving}
                    className="h-8"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
