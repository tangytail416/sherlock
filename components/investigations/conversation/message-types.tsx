'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Brain,
  Search,
  CheckCheck,
  Check,
  AlertTriangle,
  FileText,
  Clock,
  Shield,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { HTMLAttributes } from 'react';

// Base message container
export type MessageContainerProps = HTMLAttributes<HTMLDivElement> & {
  role: 'orchestrator' | 'agent' | 'user' | 'system';
};

export const MessageContainer = ({ className, role, ...props }: MessageContainerProps) => (
  <div
    className={cn(
      'group flex gap-3 mb-6',
      role === 'user' && 'justify-end',
      className
    )}
    {...props}
  />
);

// Avatar
export type MessageAvatarProps = HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  label?: string;
  variant?: 'orchestrator' | 'agent' | 'user' | 'system';
};

export const MessageAvatar = ({
  icon,
  label,
  variant = 'agent',
  className,
}: MessageAvatarProps) => {
  const variantStyles = {
    orchestrator: 'bg-purple-500/10',
    agent: 'bg-blue-500/10',
    user: 'bg-primary/10',
    system: 'bg-muted',
  };

  const iconColors = {
    orchestrator: 'text-purple-500',
    agent: 'text-blue-500',
    user: 'text-primary',
    system: 'text-muted-foreground',
  };

  const defaultIcons = {
    orchestrator: <Brain className="h-4 w-4" />,
    agent: <Search className="h-4 w-4" />,
    user: null,
    system: <AlertTriangle className="h-4 w-4" />,
  };

  return (
    <div
      className={cn(
        'flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1',
        variantStyles[variant],
        className
      )}
    >
      {icon || label ? (
        label ? (
          <span className="text-xs font-semibold">{label}</span>
        ) : (
          <span className={iconColors[variant]}>{icon}</span>
        )
      ) : (
        <span className={iconColors[variant]}>{defaultIcons[variant]}</span>
      )}
    </div>
  );
};

// Message content
export type MessageContentProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'orchestrator' | 'agent' | 'user' | 'system';
};

export const MessageContent = ({
  className,
  variant = 'agent',
  children,
  ...props
}: MessageContentProps) => {
  const variantStyles = {
    orchestrator: 'bg-secondary',
    agent: 'bg-secondary',
    user: 'bg-primary text-primary-foreground',
    system: 'bg-muted/50 border',
  };

  return (
    <div className="flex-1 space-y-2">
      {children}
    </div>
  );
};

// Message header
export type MessageHeaderProps = HTMLAttributes<HTMLDivElement> & {
  name?: string;
  badges?: React.ReactNode[];
  timestamp: Date;
};

export const MessageHeader = ({
  name,
  badges,
  timestamp,
  className,
}: MessageHeaderProps) => (
  <div className={cn('flex items-center gap-2', className)}>
    {name && <span className="font-semibold text-sm">{name}</span>}
    {badges?.map((badge, idx) => (
      <span key={idx}>{badge}</span>
    ))}
    <span className="text-xs text-muted-foreground ml-auto">
      {format(timestamp, 'HH:mm:ss')}
    </span>
  </div>
);

// Collapsible report section
export type ReportSectionProps = {
  isExpanded: boolean;
  onToggle: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
};

export const ReportSection = ({
  isExpanded,
  onToggle,
  title,
  icon,
  children,
}: ReportSectionProps) => (
  <Collapsible open={isExpanded} onOpenChange={onToggle}>
    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-accent/50 rounded p-2 -ml-2">
      {isExpanded ? (
        <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
      {icon || <FileText className="h-4 w-4" />}
      <span className="text-sm font-medium">{title}</span>
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-3 space-y-4">
      {children}
    </CollapsibleContent>
  </Collapsible>
);

// Read indicator
export type ReadIndicatorProps = {
  acknowledged: boolean;
  acknowledgedBy?: string | null;
};

export const ReadIndicator = ({ acknowledged, acknowledgedBy }: ReadIndicatorProps) => (
  <div className="flex items-center gap-2 justify-end">
    {acknowledged ? (
      <div className="flex items-center gap-1 text-xs text-green-600">
        <CheckCheck className="h-3 w-3" />
        <span>Read by {acknowledgedBy}</span>
      </div>
    ) : (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        <span>Sent</span>
      </div>
    )}
  </div>
);

// Structured data renderers
export const renderTimeline = (timeline: any[]) => {
  if (!timeline || timeline.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
        <Clock className="h-3 w-3" />
        Attack Timeline
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Timestamp</th>
              <th className="text-left p-2">Event</th>
              <th className="text-left p-2">Significance</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((item, idx) => (
              <tr key={idx} className="border-b border-border/50">
                <td className="p-2 align-top whitespace-nowrap">{item.timestamp || item.time || '-'}</td>
                <td className="p-2 align-top">{item.event || item.description || '-'}</td>
                <td className="p-2 align-top">{item.significance || item.impact || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const renderMitreAttack = (mitre: any) => {
  if (!mitre) return null;
  const techniques = Array.isArray(mitre) ? mitre : (mitre.techniques || Object.values(mitre));
  if (!techniques || techniques.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
        <Shield className="h-3 w-3" />
        MITRE ATT&CK Techniques
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Technique</th>
              <th className="text-left p-2">Tactic</th>
              <th className="text-left p-2">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {techniques.map((item: any, idx: number) => (
              <tr key={idx} className="border-b border-border/50">
                <td className="p-2 align-top">
                  {item.id || item.technique_id || '-'} {item.name || item.technique_name || ''}
                </td>
                <td className="p-2 align-top">{item.tactic || '-'}</td>
                <td className="p-2 align-top">{item.evidence || item.description || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const renderIOCs = (iocs: any) => {
  if (!iocs) return null;
  const iocData = Array.isArray(iocs) ? { items: iocs } : iocs;

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
        <AlertTriangle className="h-3 w-3" />
        Indicators of Compromise
      </div>
      <div className="space-y-2">
        {Object.entries(iocData).map(([type, values]: [string, any]) => {
          const items = Array.isArray(values) ? values : [values];
          if (items.length === 0) return null;

          return (
            <div key={type}>
              <div className="text-xs font-semibold text-muted-foreground capitalize mb-1">
                {type.replace(/_/g, ' ')}:
              </div>
              <ul className="list-disc list-inside text-xs space-y-1 ml-2">
                {items.map((item: any, idx: number) => (
                  <li key={idx}>
                    {typeof item === 'string' ? item : (item.value || JSON.stringify(item))}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const renderRecommendations = (recommendations: any) => {
  if (!recommendations) return null;

  if (Array.isArray(recommendations)) {
    return (
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2">Recommendations</div>
        <ul className="list-disc list-inside text-xs space-y-1 ml-2">
          {recommendations.map((rec: any, idx: number) => (
            <li key={idx}>
              {typeof rec === 'string' ? rec : rec.recommendation || rec.action || JSON.stringify(rec)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-2">Recommendations</div>
      <div className="space-y-3">
        {Object.entries(recommendations).map(([category, items]: [string, any]) => {
          const recs = Array.isArray(items) ? items : [items];
          return (
            <div key={category}>
              <div className="text-xs font-semibold capitalize mb-1">
                {category.replace(/_/g, ' ')}:
              </div>
              <ul className="list-disc list-inside text-xs space-y-1 ml-2">
                {recs.map((rec: any, idx: number) => (
                  <li key={idx}>
                    {typeof rec === 'string' ? rec : rec.recommendation || rec.action || JSON.stringify(rec)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};
