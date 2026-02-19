/**
 * AI Client Wrapper with Context Management
 * Automatically handles "context too large" errors by summarizing and retrying
 */

import { createAIClient, type AIClient, type ChatMessage } from '@/lib/ai';
import { summarizeAgentContext, estimateTokenCount } from './context-manager';

export interface AICallContext {
  agentName: string;
  aiProvider: string;
  agentFindings: any[];
  onContextSummarized?: (summarizedFindings: any[], summary: any) => void;
}

/**
 * Wrapper around AI client that handles context-too-large errors
 * Automatically summarizes context and retries on token limit errors
 */
export async function chatWithContextManagement(
  messages: ChatMessage[],
  context: AICallContext,
  options?: {
    temperature?: number;
    maxTokens?: number;
    maxRetries?: number;
  }
): Promise<{ content: string; usage?: any }> {
  const maxRetries = options?.maxRetries ?? 1;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      const client = await createAIClient(context.aiProvider);
      
      // Estimate token count before sending
      const messagesText = messages.map(m => m.content).join('\n');
      const estimatedTokens = estimateTokenCount(messagesText);
      
      console.log(`[AI Wrapper] Sending to LLM (${estimatedTokens.toLocaleString()} estimated tokens, attempt ${retryCount + 1}/${maxRetries + 1})`);

      const response = await client.chat(messages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      return response;
      
    } catch (error: any) {
      // Check if this is a token/context limit error
      const isContextError = 
        error.message?.toLowerCase().includes('token') || 
        error.message?.toLowerCase().includes('context') ||
        error.message?.includes('Context too large');

      if (isContextError && retryCount < maxRetries && context.agentFindings.length > 0) {
        console.error(`[AI Wrapper] ❌ Context too large error (attempt ${retryCount + 1}):`, error.message);
        console.log(`[AI Wrapper] Attempting automatic context summarization...`);
        
        try {
          // Summarize the agent's findings to reduce context
          const { summarizedFindings, summary } = await summarizeAgentContext(
            context.agentName,
            context.agentFindings,
            context.aiProvider
          );

          console.log(`[AI Wrapper] ✅ Context summarized successfully:`);
          console.log(`  - Token reduction: ${summary.originalTokenCount.toLocaleString()} → ${summary.summarizedTokenCount.toLocaleString()}`);
          console.log(`  - Reduction: ${((1 - summary.summarizedTokenCount / summary.originalTokenCount) * 100).toFixed(1)}%`);

          // Notify caller about the summarization
          if (context.onContextSummarized) {
            context.onContextSummarized(summarizedFindings, summary);
          }

          // Update the findings in context for next retry
          context.agentFindings.length = 0;
          context.agentFindings.push(...summarizedFindings);

          // Increment retry counter and try again
          retryCount++;
          console.log(`[AI Wrapper] Retrying with summarized context...`);
          continue;
          
        } catch (summarizationError: any) {
          console.error(`[AI Wrapper] ❌ Summarization failed:`, summarizationError.message);
          throw new Error(
            `Context too large and automatic summarization failed: ${summarizationError.message}`
          );
        }
      } else if (isContextError) {
        // Context error but can't retry (no more retries or no findings to summarize)
        throw new Error(
          `Context too large: ${error.message}. Unable to reduce context further.`
        );
      } else {
        // Not a context error, re-throw
        throw error;
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('Maximum retries exceeded');
}

/**
 * Create a managed AI client that automatically handles context errors
 */
export function createManagedAIClient(context: AICallContext) {
  return {
    async chat(
      messages: ChatMessage[],
      options?: {
        temperature?: number;
        maxTokens?: number;
      }
    ) {
      return chatWithContextManagement(messages, context, options);
    },
  };
}
