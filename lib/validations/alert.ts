import { z } from 'zod';

export const createAlertSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  rawData: z.record(z.string(), z.any()).optional(),
  timestamp: z.string().datetime().optional(),
});

export const updateAlertSchema = z.object({
  status: z.enum(['new', 'investigating', 'resolved', 'dismissed']).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});

export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;
