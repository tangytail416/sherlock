import { cn } from '@/lib/utils';

export interface ColorStyle {
  bg: string;
  text: string;
  border: string;
}

export const DEFAULT_COLORS: Record<string, Record<string, ColorStyle>> = {
  severity: {
    critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-white dark:text-slate-150', border: 'border-red-300 dark:border-red-700' },
    high: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-white dark:text-slate-150', border: 'border-yellow-300 dark:border-yellow-700' },
    medium: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-white dark:text-slate-150', border: 'border-green-300 dark:border-green-700' },
    low: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-white dark:text-slate-150', border: 'border-blue-300 dark:border-blue-700' },
  },
  alertStatus: {
    new: { bg: 'bg-white dark:bg-slate-800', text: 'text-white dark:text-slate-150', border: 'border-slate-300 dark:border-slate-600' },
    investigating: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-white dark:text-slate-150', border: 'border-yellow-300 dark:border-yellow-700' },
    resolved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-white dark:text-slate-150', border: 'border-green-300 dark:border-green-700' },
    dismissed: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-white dark:text-slate-150', border: 'border-slate-200 dark:border-slate-700' },
  },
  investigationStatus: {
    pending: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-white dark:text-slate-150', border: 'border-slate-200 dark:border-slate-700' },
    active: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-white dark:text-slate-150', border: 'border-blue-300 dark:border-blue-700' },
    completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-white dark:text-slate-150', border: 'border-green-300 dark:border-green-700' },
    failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-white dark:text-slate-150', border: 'border-red-300 dark:border-red-700' },
    stopped: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-white dark:text-slate-150', border: 'border-orange-300 dark:border-orange-700' },
  },
};

export const COLOR_PRESETS: { name: string; bg: string; text: string; border: string }[] = [
  { name: 'White', bg: 'bg-white dark:bg-slate-800', text: 'text-white dark:text-slate-150', border: 'border-slate-300 dark:border-slate-600' },
  { name: 'Red', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-white dark:text-slate-150', border: 'border-red-300 dark:border-red-700' },
  { name: 'Orange', bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-white dark:text-slate-150', border: 'border-orange-300 dark:border-orange-700' },
  { name: 'Yellow', bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-white dark:text-slate-150', border: 'border-yellow-300 dark:border-yellow-700' },
  { name: 'Green', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-white dark:text-slate-150', border: 'border-green-300 dark:border-green-700' },
  { name: 'Blue', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-white dark:text-slate-150', border: 'border-blue-300 dark:border-blue-700' },
  { name: 'Purple', bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-white dark:text-slate-150', border: 'border-purple-300 dark:border-purple-700' },
  { name: 'Pink', bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-white dark:text-slate-150', border: 'border-pink-300 dark:border-pink-700' },
  { name: 'Slate', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-white dark:text-slate-150', border: 'border-slate-200 dark:border-slate-700' },
];

export function getSeverityClasses(severity: string, colors?: Record<string, Record<string, ColorStyle>>): string {
  const severityColors = colors?.severity || DEFAULT_COLORS.severity;
  const style = severityColors[severity.toLowerCase()] || severityColors.medium;
  return cn(style.bg, style.text, style.border);
}

export function getStatusClasses(status: string, colors?: Record<string, Record<string, ColorStyle>>): string {
  const statusColors = colors?.alertStatus || DEFAULT_COLORS.alertStatus;
  const style = statusColors[status.toLowerCase()] || statusColors.new;
  return cn(style.bg, style.text, style.border);
}

export function getInvestigationStatusClasses(status: string, colors?: Record<string, Record<string, ColorStyle>>): string {
  const statusColors = colors?.investigationStatus || DEFAULT_COLORS.investigationStatus;
  const style = statusColors[status.toLowerCase()] || statusColors.pending;
  return cn(style.bg, style.text, style.border);
}
