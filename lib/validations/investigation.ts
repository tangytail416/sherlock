import { z } from 'zod';

export const createInvestigationSchema = z.object({
  alertId: z.string().min(1, 'Alert ID is required'),
  aiProvider: z.enum(['glm', 'openai', 'azure', 'openrouter']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
});

export const updateInvestigationSchema = z.object({
  status: z.enum(['pending', 'active', 'completed', 'failed', 'stopped']).optional(),
  findings: z.record(z.string(), z.any()).optional(),
});

export type CreateInvestigationInput = z.infer<typeof createInvestigationSchema>;
export type UpdateInvestigationInput = z.infer<typeof updateInvestigationSchema>;
