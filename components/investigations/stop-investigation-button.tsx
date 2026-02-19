'use client';

import { useState, useEffect } from 'react';
import { StopCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface StopInvestigationButtonProps {
  investigationId: string;
}

export function StopInvestigationButton({
  investigationId,
}: StopInvestigationButtonProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [unacknowledgedMessages, setUnacknowledgedMessages] = useState<any[]>([]);
  const [messageAction, setMessageAction] = useState<'keep' | 'discard'>('keep');
  const router = useRouter();

  // Check for unacknowledged messages when dialog opens
  useEffect(() => {
    if (isOpen) {
      checkUnacknowledgedMessages();
    }
  }, [isOpen, investigationId]);

  const checkUnacknowledgedMessages = () => {
    // Check global state for unacknowledged messages
    const storageKey = `investigation-${investigationId}-messages`;
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      try {
        const messages = JSON.parse(stored);
        const unacknowledged = messages.filter((msg: any) => !msg.acknowledged);
        setUnacknowledgedMessages(unacknowledged);
      } catch (error) {
        console.error('Failed to check messages:', error);
      }
    }
  };

  const handleStop = async () => {
    setIsStopping(true);

    try {
      // If discarding messages, clear them from localStorage
      if (messageAction === 'discard' && unacknowledgedMessages.length > 0) {
        const storageKey = `investigation-${investigationId}-messages`;
        const stored = localStorage.getItem(storageKey);
        
        if (stored) {
          try {
            const messages = JSON.parse(stored);
            // Keep only acknowledged messages
            const kept = messages.filter((msg: any) => msg.acknowledged);
            localStorage.setItem(storageKey, JSON.stringify(kept));
            
            // Also clear from global state
            const globalStates = (global as any).investigationStates;
            if (globalStates && globalStates[investigationId]) {
              globalStates[investigationId].user_messages = 
                globalStates[investigationId].user_messages.filter((msg: any) => msg.acknowledged);
            }
          } catch (error) {
            console.error('Failed to discard messages:', error);
          }
        }
      }

      const response = await fetch(`/api/investigations/${investigationId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop investigation');
      }

      const data = await response.json();

      toast.success('Investigation stopped', {
        description: `${data.stoppedAgents} running agent(s) stopped. ${
          messageAction === 'keep' && unacknowledgedMessages.length > 0
            ? `${unacknowledgedMessages.length} message(s) kept for resume.`
            : ''
        }`,
      });

      // Refresh the page to show the updated status
      setIsOpen(false);
      router.refresh();
    } catch (error: any) {
      console.error('Error stopping investigation:', error);
      toast.error('Failed to stop investigation', {
        description: error.message || 'An error occurred',
      });
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={isStopping}>
          <StopCircle className="h-4 w-4 mr-2" />
          Stop Investigation
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop Investigation?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately stop the investigation and mark any running agents as stopped.
            The investigation state will be preserved and you can:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground px-6">
          <li><strong>Resume</strong> - Continue from where it stopped</li>
          <li><strong>Restart</strong> - Start fresh from the beginning</li>
        </ul>

        {/* Message handling options */}
        {unacknowledgedMessages.length > 0 && (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm font-medium mb-3">
              You have {unacknowledgedMessages.length} unacknowledged steering message{unacknowledgedMessages.length > 1 ? 's' : ''}.
            </p>
            <RadioGroup value={messageAction} onValueChange={(v) => setMessageAction(v as any)}>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="keep" id="keep" />
                  <Label htmlFor="keep" className="font-normal cursor-pointer">
                    Keep messages for resume
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="discard" id="discard" />
                  <Label htmlFor="discard" className="font-normal cursor-pointer">
                    Discard unacknowledged messages
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleStop} 
            disabled={isStopping}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isStopping ? 'Stopping...' : `${messageAction === 'keep' && unacknowledgedMessages.length > 0 ? 'Keep & ' : ''}Stop`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
