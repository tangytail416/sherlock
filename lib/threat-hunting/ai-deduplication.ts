import { prisma } from '@/lib/db';
import { createAIClient } from '@/lib/ai';
import { loadAgentConfig } from '../agents/config-loader';

export async function executeAiPostHuntDeduplication(
  threatHuntId: string,
  aiProvider: string = 'openrouter',
  modelUsed: string = 'glm-4-plus'
) {
  console.log(`[AI Dedup] Starting post-hunt AI deduplication for hunt: ${threatHuntId}`);

  // 1. Fetch all findings for this threat hunt
  const findings = await prisma.threatFinding.findMany({
    where: { threatHuntId },
    select: {
      id: true,
      findingType: true,
      description: true,
      severity: true,
      affectedEntities: true,
      detectedAt: true,
      alertId: true,
      investigationId: true
    }
  });

  if (findings.length <= 1) {
    console.log(`[AI Dedup] Not enough findings to deduplicate (${findings.length}). Skipping.`);
    return;
  }

  // 2. Load the Agent
  const agentConfig = await loadAgentConfig('finding_deduplicator');
  if (!agentConfig) throw new Error('finding_deduplicator agent configuration not found');

  const aiClient = await createAIClient(aiProvider, { modelName: modelUsed });

  // 3. Format findings for the AI
  const promptData = findings.map(f => ({
    id: f.id,
    type: f.findingType,
    severity: f.severity,
    description: f.description,
    detected_at: f.detectedAt,
    entities: f.affectedEntities
  }));

  const userPrompt = `Here are the findings from the recent threat hunt:\n\n${JSON.stringify(promptData, null, 2)}\n\nAnalyze these and output the JSON grouping the duplicates.`;

  // 4. Get Agent's Decision
  try {
    const response = await aiClient.chat([
      { role: 'system', content: agentConfig.prompts.system },
      { role: 'user', content: userPrompt }
    ]);

    const responseText = typeof response === 'string' ? response : response.content || String(response);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.log('[AI Dedup] Could not parse JSON from agent response.');
      return;
    }

    const result = JSON.parse(jsonMatch[0]);
    const groups = result.deduplication_groups || [];

    if (groups.length === 0) {
      console.log('[AI Dedup] AI found no duplicates.');
      return;
    }

    let deletedCount = 0;

    // 5. Process Deletions
    for (const group of groups) {
      const { keep_id, duplicate_ids, reason } = group;
      console.log(`[AI Dedup] Merging incident: Keeping ${keep_id}. Reason: ${reason}`);

      for (const dupId of duplicate_ids) {
        // Find the duplicate to get its associated Alert and Investigation IDs
        const dupFinding = findings.find(f => f.id === dupId);
        if (!dupFinding) continue;

        // Delete the associated Investigation if it exists
        if (dupFinding.investigationId) {
          await prisma.investigation.delete({ where: { id: dupFinding.investigationId } }).catch(() => {});
        }

        // Delete the associated Alert if it exists
        if (dupFinding.alertId) {
          await prisma.alert.delete({ where: { id: dupFinding.alertId } }).catch(() => {});
        }

        // Delete the Threat Finding itself
        await prisma.threatFinding.delete({ where: { id: dupId } }).catch(() => {});
        
        deletedCount++;
      }
    }

    // 6. Update Threat Hunt stats
    await prisma.threatHunt.update({
      where: { id: threatHuntId },
      data: { findingsCount: { decrement: deletedCount } }
    });

    console.log(`[AI Dedup] Successfully removed ${deletedCount} duplicate findings & alerts.`);

  } catch (error) {
    console.error('[AI Dedup] Error during AI deduplication:', error);
  }
}
