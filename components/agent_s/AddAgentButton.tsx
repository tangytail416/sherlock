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
  const router=useRouter();
  const handleFromYaml = () => {
   // 1. Create an invisible file input element dynamically
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.yaml,.yml';

  // 2. Set up the event listener for when the user selects a file
  fileInput.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const yamlText = event.target?.result as string;

        // 3. Parse the YAML (This will automatically throw an error if the YAML is invalid)
        const parsedData = yaml.load(yamlText);

        if (!parsedData || typeof parsedData !== 'object') {
          throw new Error('Invalid YAML format: Must be an object.');
        }

        // 4. Send the parsed data to your API
        // (Assuming your POST endpoint accepts standard JSON)
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

        // 5. Success UI
        toast.success(`Agent "${(parsedData as any).name || 'from YAML'}" imported successfully!`);
        
        // Refresh the page/table to show the new agent
        router.refresh(); 

      } catch (error: any) {
        console.error('YAML Import Error:', error);
        toast.error(`Import failed: ${error.message}`);
      }
    };

    reader.onerror = () => {
      toast.error('Failed to read the file.');
    };

    // Read the file as plain text
    reader.readAsText(file);
  };

  // 3. Trigger the file browser to open
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

// Exporting as lowercase to match your exact import statement, 
// though changing your import to { AddAgentButton } is recommended!
export { AddAgentButton };