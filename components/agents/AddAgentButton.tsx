'use client';

import { Plus, FileCode, Sparkles } from 'lucide-react';
import yaml from 'js-yaml';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AddAgentButton() {
  const router = useRouter();

  const handleFromYaml = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.yaml,.yml';

    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const yamlText = event.target?.result as string;
          const parsedData = yaml.load(yamlText);

          if (!parsedData || typeof parsedData !== 'object') {
            throw new Error('Invalid YAML format: Must be an object.');
          }

          const response = await fetch('/api/agents', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(parsedData),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to save agent to database.');
          }

          toast.success(`Agent "${(parsedData as any).name || 'from YAML'}" imported successfully!`);
          router.refresh(); 

        } catch (error: any) {
          console.error('YAML Import Error:', error);
          toast.error(`Import failed: ${error.message}`);
        }
      };

      reader.onerror = () => {
        toast.error('Failed to read the file.');
      };

      reader.readAsText(file);
    };

    fileInput.click();
  };

  const handleGenerate = () => {
    console.log('Generate');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Agent
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleFromYaml} className="cursor-pointer">
          <FileCode className="mr-2 h-4 w-4" />
          <span>Import YAML</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleGenerate} className="cursor-pointer">
          <Sparkles className="mr-2 h-4 w-4" />
          <span>Generate for me</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}