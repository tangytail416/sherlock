'use client';

import { useEffect, useState } from 'react';
import { 
  Plus, 
  Loader2, 
  X, 
  RotateCcw, 
  Tag, 
  Shield, 
  AlertTriangle, 
  Users,
  Check,
  Sparkles,
  Palette,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DEFAULT_COLORS, COLOR_PRESETS, ColorStyle } from '@/lib/constants/colors';

interface TagConfig {
  id: string;
  category: string;
  values: string[];
}

const DEFAULT_TAGS: Omit<TagConfig, 'id'>[] = [
  { category: 'classification', values: ['True Positive', 'False Positive', 'Benign', 'Testing', 'Under Investigation'] },
  { category: 'threatType', values: ['Malware', 'Phishing', 'Ransomware', 'Unauthorized Access', 'Data Theft', 'Suspicious Logon', 'Lateral Movement'] },
  { category: 'campaign', values: ['APT29 (Cozy Bear)', 'FIN7', 'APT28 (Fancy Bear)', 'UNC3886', 'Lazarus Group', 'Charming Kitten', 'APT41 (Wicked Panda)'] },
];

const CATEGORY_CONFIG: Record<string, { 
  title: string; 
  description: string; 
  icon: React.ReactNode;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
}> = {
  classification: { 
    title: 'Classification', 
    description: 'Classify investigation outcomes and verdicts',
    icon: <Check className="h-5 w-5" />,
    color: 'text-blue-500',
    badgeVariant: 'default',
  },
  threatType: { 
    title: 'Threat Type', 
    description: 'Categorize detected threat types',
    icon: <AlertTriangle className="h-5 w-5" />,
    color: 'text-orange-500',
    badgeVariant: 'secondary',
  },
  campaign: { 
    title: 'Campaign', 
    description: 'Associate with threat actor campaigns',
    icon: <Users className="h-5 w-5" />,
    color: 'text-purple-500',
    badgeVariant: 'outline',
  },
};

const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'True Positive': {
    bg: 'bg-emerald-500/15',
    text: 'text-white dark:text-slate-150',
    border: 'border-emerald-500/40',
  },
  'False Positive': {
    bg: 'bg-slate-500/15',
    text: 'text-white dark:text-slate-150',
    border: 'border-slate-500/40',
  },
  'Benign': {
    bg: 'bg-sky-500/15',
    text: 'text-white dark:text-slate-150',
    border: 'border-sky-500/40',
  },
  'Testing': {
    bg: 'bg-amber-500/15',
    text: 'text-white dark:text-slate-150',
    border: 'border-amber-500/40',
  },
  'Under Investigation': {
    bg: 'bg-violet-500/15',
    text: 'text-white dark:text-slate-150',
    border: 'border-violet-500/40',
  },
};

function getTagStyle(category: string, tag: string): { bg: string; text: string; border: string } | null {
  if (category === 'classification') {
    return CLASSIFICATION_COLORS[tag] || null;
  }
  return null;
}

interface ColorConfig {
  id: string;
  category: string;
  colors: Record<string, ColorStyle>;
}

const COLOR_CATEGORY_INFO: Record<string, { title: string; description: string; icon: React.ReactNode; color: string }> = {
  severity: {
    title: 'Severity Colors',
    description: 'Colors for alert severity levels',
    icon: <AlertTriangle className="h-5 w-5" />,
    color: 'text-red-500',
  },
  alertStatus: {
    title: 'Alert Status Colors',
    description: 'Colors for alert status badges',
    icon: <AlertCircle className="h-5 w-5" />,
    color: 'text-blue-500',
  },
  investigationStatus: {
    title: 'Investigation Status Colors',
    description: 'Colors for investigation status badges',
    icon: <Check className="h-5 w-5" />,
    color: 'text-emerald-500',
  },
};

export default function TagsConfigPage() {
  const [configs, setConfigs] = useState<TagConfig[]>([]);
  const [colorConfigs, setColorConfigs] = useState<ColorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newTags, setNewTags] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConfigs();
    fetchColorConfigs();
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
      toast.error('Failed to load tag configurations');
    } finally {
      setLoading(false);
    }
  };

  const fetchColorConfigs = async () => {
    try {
      const response = await fetch('/api/color-config');
      if (response.ok) {
        const data = await response.json();
        setColorConfigs(data);
      }
    } catch (error) {
      console.error('Failed to fetch color configs:', error);
    }
  };

  const getColorConfig = (category: string) => {
    const config = colorConfigs.find((c) => c.category === category);
    return config?.colors || DEFAULT_COLORS[category] || {};
  };

  const handleColorChange = async (category: string, key: string, colorPreset: { bg: string; text: string; border: string }) => {
    const currentColors = getColorConfig(category);
    const updatedColors = { ...currentColors, [key]: colorPreset };
    
    setSaving(`color-${category}`);
    try {
      const response = await fetch('/api/color-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, colors: updatedColors }),
      });
      if (response.ok) {
        await fetchColorConfigs();
        toast.success('Color updated');
      } else {
        toast.error('Failed to save color');
      }
    } catch (error) {
      toast.error('Failed to save color');
    } finally {
      setSaving(null);
    }
  };

  const handleResetColorsToDefault = async (category: string) => {
    const defaultColors = DEFAULT_COLORS[category];
    if (!defaultColors) return;

    setSaving(`color-${category}`);
    try {
      const response = await fetch('/api/color-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, colors: defaultColors }),
      });
      if (response.ok) {
        await fetchColorConfigs();
        toast.success('Colors reset to defaults');
      } else {
        toast.error('Failed to reset colors');
      }
    } catch (error) {
      toast.error('Failed to reset colors');
    } finally {
      setSaving(null);
    }
  };

  const hasColorChanges = (category: string): boolean => {
    const currentColors = getColorConfig(category);
    const defaultColors = DEFAULT_COLORS[category];
    
    const currentKeys = Object.keys(currentColors).sort();
    const defaultKeys = Object.keys(defaultColors).sort();
    
    if (JSON.stringify(currentKeys) !== JSON.stringify(defaultKeys)) {
      return true;
    }
    
    for (const key of defaultKeys) {
      const current = currentColors[key];
      const def = defaultColors[key];
      if (!current || !def) return true;
      if (current.bg !== def.bg || current.text !== def.text || current.border !== def.border) {
        return true;
      }
    }
    
    return false;
  };

  const getCategoryValues = (category: string): string[] => {
    const config = configs.find((c) => c.category === category);
    return config?.values || DEFAULT_TAGS.find((d) => d.category === category)?.values || [];
  };

  const getDefaultValues = (category: string): string[] => {
    return DEFAULT_TAGS.find((d) => d.category === category)?.values || [];
  };

  const isDefaultTag = (category: string, tag: string): boolean => {
    return getDefaultValues(category).includes(tag);
  };

  const hasChanges = (category: string): boolean => {
    const current = [...getCategoryValues(category)].sort();
    const defaults = [...getDefaultValues(category)].sort();
    return JSON.stringify(current) !== JSON.stringify(defaults);
  };

  const handleAddTag = async (category: string) => {
    const tag = newTags[category]?.trim();
    if (!tag) return;

    const currentValues = getCategoryValues(category);
    if (currentValues.includes(tag)) {
      toast.error('Tag already exists');
      return;
    }

    const updatedValues = [...currentValues, tag];
    await saveConfig(category, updatedValues);
    setNewTags({ ...newTags, [category]: '' });
  };

  const handleRemoveTag = async (category: string, tagToRemove: string) => {
    const currentValues = getCategoryValues(category);
    const updatedValues = currentValues.filter((t) => t !== tagToRemove);
    await saveConfig(category, updatedValues);
  };

  const saveConfig = async (category: string, values: string[]) => {
    setSaving(category);
    try {
      const response = await fetch('/api/tag-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, values }),
      });
      if (response.ok) {
        await fetchConfigs();
        toast.success('Tags updated');
      } else {
        toast.error('Failed to save tags');
      }
    } catch (error) {
      toast.error('Failed to save tags');
    } finally {
      setSaving(null);
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
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading tag configurations...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Tag className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">
                Tags Configuration
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                Manage investigation tags for classification, threat types, and campaigns
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {DEFAULT_TAGS.map((defaultConfig) => {
            const category = defaultConfig.category;
            const config = CATEGORY_CONFIG[category];
            const values = getCategoryValues(category);
            const defaults = getDefaultValues(category);
            const categorySaving = saving === category;
            const hasModifications = hasChanges(category);
            const customCount = values.filter(v => !isDefaultTag(category, v)).length;

            return (
              <Card key={category} className="relative overflow-hidden">
                <div 
                  className={cn(
                    "absolute top-0 left-0 right-0 h-1",
                    category === 'classification' && "bg-blue-500",
                    category === 'threatType' && "bg-orange-500",
                    category === 'campaign' && "bg-purple-500",
                  )} 
                />
                
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg bg-muted", config.color)}>
                        {config.icon}
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {config.title}
                          {hasModifications && (
                            <Badge variant="outline" className="text-xs font-normal">
                              Modified
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {config.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span className="font-medium">{values.length}</span>
                      <span>total</span>
                    </div>
                    {customCount > 0 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-amber-600 dark:text-amber-400">
                            {customCount} custom
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="min-h-[80px]">
                    {values.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {values.map((tag) => {
                          const isDefault = isDefaultTag(category, tag);
                          const tagStyle = getTagStyle(category, tag);
                          const isCustom = !isDefault;
                          
                          return (
                            <Badge
                              key={tag}
                              variant="outline"
                              className={cn(
                                "flex items-center gap-1 pr-1 transition-all group border",
                                tagStyle 
                                  ? `${tagStyle.bg} ${tagStyle.text} ${tagStyle.border}`
                                  : isDefault 
                                    ? "bg-muted/50" 
                                    : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              )}
                            >
                              <span className="max-w-[150px] truncate" title={tag}>
                                {tag}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 hover:bg-transparent opacity-50 hover:opacity-100 transition-opacity"
                                onClick={() => handleRemoveTag(category, tag)}
                                disabled={categorySaving}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed rounded-lg">
                        <Tag className="h-8 w-8 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">No tags configured</p>
                        <p className="text-xs text-muted-foreground/75">Add your first tag below</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Input
                      placeholder={`Add new ${config.title.toLowerCase()}...`}
                      value={newTags[category] || ''}
                      onChange={(e) => setNewTags({ ...newTags, [category]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag(category);
                        }
                      }}
                      className="h-9"
                      disabled={categorySaving}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleAddTag(category)}
                      disabled={categorySaving || !newTags[category]?.trim()}
                      className="h-9 px-3"
                    >
                      {categorySaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {hasModifications && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full h-8"
                          disabled={categorySaving}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Reset to Defaults
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset to default tags?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove all custom tags and restore the default {config.title.toLowerCase()} tags. 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleResetToDefault(category)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Reset Tags
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Palette className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Color Configuration</h2>
              <p className="text-sm text-muted-foreground">
                Customize colors for severity and status badges
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {Object.entries(DEFAULT_COLORS).map(([category, defaultColors]) => {
              const info = COLOR_CATEGORY_INFO[category];
              const currentColors = getColorConfig(category);
              const isSaving = saving === `color-${category}`;

              return (
                <Card key={category} className="relative overflow-hidden">
                  <div
                    className={cn(
                      "absolute top-0 left-0 right-0 h-1",
                      category === 'severity' && "bg-red-500",
                      category === 'alertStatus' && "bg-blue-500",
                      category === 'investigationStatus' && "bg-emerald-500",
                    )}
                  />

                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg bg-muted", info.color)}>
                        {info.icon}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{info.title}</CardTitle>
                        <CardDescription>{info.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {Object.entries(defaultColors).map(([key, defaultColor]) => {
                      const currentColor: { bg: string; text: string; border: string } = currentColors[key] || defaultColor;
                      
                      return (
                        <div key={key} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                "border min-w-[80px] justify-center capitalize",
                                currentColor.bg,
                                currentColor.text,
                                currentColor.border
                              )}
                            >
                              {key}
                            </Badge>
                          </div>
                          
                          <Select
                            value={COLOR_PRESETS.findIndex(
                              (p) => p.bg === currentColor.bg && p.text === currentColor.text
                            ).toString()}
                            onValueChange={(value) => {
                              const preset = COLOR_PRESETS[parseInt(value)];
                              if (preset) {
                                handleColorChange(category, key, preset);
                              }
                            }}
                            disabled={isSaving}
                          >
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue placeholder="Select color" />
                            </SelectTrigger>
                            <SelectContent>
                              {COLOR_PRESETS.map((preset, index) => (
                                <SelectItem key={preset.name} value={index.toString()}>
                                  <div className="flex items-center gap-2">
                                    <div className={cn(
                                      "w-4 h-4 rounded-full border",
                                      preset.bg,
                                      preset.border
                                    )} />
                                    {preset.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                    
                    {hasColorChanges(category) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 mt-2"
                        onClick={() => handleResetColorsToDefault(category)}
                        disabled={isSaving}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset to Defaults
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Tips</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Classification tags are color-coded for quick identification</li>
                  <li>Tags with an amber border are custom additions</li>
                  <li>Press Enter to quickly add a new tag</li>
                  <li>Severity and status colors can be customized in the Color Configuration section</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
