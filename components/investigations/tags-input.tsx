'use client';

import { useState, useEffect } from 'react';
import { Plus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface TagConfig {
  id: string;
  category: string;
  values: string[];
}

interface TagsInputProps {
  investigationId: string;
  classificationTags: string[];
  threatTypeTags: string[];
  campaignTags: string[];
  onUpdate: () => void;
}

const DEFAULT_TAGS = {
  classification: ['True Positive', 'False Positive', 'Benign', 'Testing', 'Under Investigation'],
  threatType: ['Malware', 'Phishing', 'Ransomware', 'Unauthorized Access', 'Data Theft', 'Suspicious Logon', 'Lateral Movement'],
  campaign: ['APT29 (Cozy Bear)', 'FIN7', 'APT28 (Fancy Bear)', 'UNC3886', 'Lazarus Group', 'Charming Kitten', 'APT41 (Wicked Panda)'],
};

export function TagsInput({
  investigationId,
  classificationTags = [],
  threatTypeTags = [],
  campaignTags = [],
  onUpdate,
}: TagsInputProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tagConfigs, setTagConfigs] = useState<TagConfig[]>([]);
  const [localClassification, setLocalClassification] = useState(classificationTags[0] || '');
  const [localThreatType, setLocalThreatType] = useState(threatTypeTags);
  const [localCampaign, setLocalCampaign] = useState(campaignTags[0] || '');

  const allTags = [...classificationTags, ...threatTypeTags, ...campaignTags];

  useEffect(() => {
    fetchTagConfigs();
  }, []);

  useEffect(() => {
  if (!open) {
    setLocalClassification(classificationTags[0] || '');
    setLocalThreatType(threatTypeTags);
    setLocalCampaign(campaignTags[0] || '');
  }
}, [classificationTags, threatTypeTags, campaignTags, open]);

  const fetchTagConfigs = async () => {
    try {
      const response = await fetch('/api/tag-config');
      if (response.ok) {
        const data = await response.json();
        setTagConfigs(data);
      }
    } catch (error) {
      console.error('Failed to fetch tag configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTagOptions = (category: string): string[] => {
    const config = tagConfigs.find((c) => c.category === category);
    return config?.values || DEFAULT_TAGS[category as keyof typeof DEFAULT_TAGS] || [];
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/investigations/${investigationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classificationTags: localClassification ? [localClassification] : [],
          threatTypeTags: localThreatType,
          campaignTags: localCampaign ? [localCampaign] : [],
        }),
      });
      if (res.ok) {
        onUpdate();
        setOpen(false);
      }
    } catch (error) {
      console.error('Failed to save tags:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleThreatType = (tag: string) => {
    if (localThreatType.includes(tag)) {
      setLocalThreatType(localThreatType.filter((t) => t !== tag));
    } else {
      setLocalThreatType([...localThreatType, tag]);
    }
  };

  const handleClearAll = () => {
    setLocalClassification('');
    setLocalThreatType([]);
    setLocalCampaign('');
  };

  if (loading) {
    return (
      <Button variant="outline" size="sm" className="h-8 rounded-full" disabled>
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Loading...
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {allTags.length > 0 ? (
        <div className="flex gap-1 flex-wrap">
          {classificationTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {threatTypeTags.map((tag) => (
            <Badge key={tag} variant="default" className="text-xs">
              {tag}
            </Badge>
          ))}
          {campaignTags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs border-purple-500 text-purple-700">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 rounded-full">
            <Plus className="h-3 w-3 mr-1" />
            {allTags.length > 0 ? 'Edit Tags' : 'Add Tags'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Edit Tags</p>
              <button
                onClick={handleClearAll}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
              >
                <X className="h-3 w-3" />
                Clear all
              </button>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Classification (single select)</p>
              <div className="flex flex-wrap gap-1">
                {getTagOptions('classification').map((tag) => (
                  <Badge
                    key={tag}
                    variant={localClassification === tag ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => setLocalClassification(tag === localClassification ? '' : tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Threat Type (multi-select)</p>
              <div className="flex flex-wrap gap-1">
                {getTagOptions('threatType').map((tag) => (
                  <Badge
                    key={tag}
                    variant={localThreatType.includes(tag) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleThreatType(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Campaign (single select)</p>
              <div className="flex flex-wrap gap-1">
                {getTagOptions('campaign').map((tag) => (
                  <Badge
                    key={tag}
                    variant={localCampaign === tag ? 'default' : 'outline'}
                    className={`cursor-pointer text-xs ${localCampaign === tag ? '' : 'border-purple-500 text-purple-700'}`}
                    onClick={() => setLocalCampaign(tag === localCampaign ? '' : tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Tags
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}