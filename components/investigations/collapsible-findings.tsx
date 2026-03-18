'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CollapsibleFindingsProps {
  findings: any;
}

const MAX_LINES = 50;

export function CollapsibleFindings({ findings }: CollapsibleFindingsProps) {
  const [expanded, setExpanded] = useState(false);

  const findingsString = useMemo(() => {
    return JSON.stringify(findings, null, 2);
  }, [findings]);

  const lines = findingsString.split('\n');
  const isTruncated = lines.length > MAX_LINES;
  const displayText = expanded ? findingsString : lines.slice(0, MAX_LINES).join('\n');

  if (!isTruncated) {
    return (
      <pre className="p-4 bg-muted rounded-lg overflow-auto text-xs">
        {findingsString}
      </pre>
    );
  }

  return (
    <div>
      <pre className="p-4 bg-muted rounded-lg overflow-auto text-xs">
        {displayText}
        {!expanded && '\n...'}
      </pre>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 w-full flex items-center justify-center"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-4 w-4 mr-2" />
            Show Less
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4 mr-2" />
            Show More ({lines.length - MAX_LINES} more lines)
          </>
        )}
      </Button>
    </div>
  );
}
