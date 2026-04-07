import { createAIClient } from '@/lib/ai';

/**
 * The Judge reviews findings and generates a strict challenge for the worker agent.
 */
export async function generateJudgeChallenge(
  aiProvider: string,
  modelUsed: string,
  agentName: string,
  findings: any
): Promise<string | null> {
  const client = await createAIClient(aiProvider, { modelName: modelUsed });
  
  const prompt = `
You are a Verification Reviewer. The agent "${agentName}" has submitted the following findings at the end of its investigation:

${JSON.stringify(findings, null, 2)}

YOUR TASK:
You are to extract and list the core factual claims the agent made, and present them back to the agent so it can double-check its own work.

Respond ONLY with a message formatted exactly like this example:
"You have claimed the following:
1. [Claim 1]
2. [Claim 2]
I want you to confirm that these findings are correct. If you already have the raw logs to prove this, quote them. If not, run a targeted search to confirm they are real. If they are not correct, or you cannot find proof, please redo your iteration and revise your analysis."

If the agent has explicitly included raw log proof directly in this final JSON submission, respond with "APPROVED".
  `.trim();

  const response = await client.chat([{ role: 'user', content: prompt }]);
  const challenge = typeof response === 'string' ? response : response.content;

  if (challenge.includes('APPROVED')) return null;
  return challenge;
}
