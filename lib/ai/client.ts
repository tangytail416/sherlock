import OpenAI from 'openai';
import { prisma } from '@/lib/db';
import type { AIProviderConfig, ChatMessage, ChatCompletionResponse, AIClient } from './types';

export class UnifiedAIClient implements AIClient {
  private client: OpenAI;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;

    // All providers use OpenAI-compatible SDK
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      defaultHeaders: this.getProviderHeaders(config.type),
    });
  }

  private getProviderHeaders(type: string): Record<string, string> {
    switch (type) {
      case 'openrouter':
        return {
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
          'X-Title': 'Hunting Ground',
        };
      default:
        return {};
    }
  }

  async chat(
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<ChatCompletionResponse> {
    // Calculate total context size for logging
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4); // Rough estimate: 1 token ≈ 4 chars
    
    console.log('=== AI Provider Request ===');
    console.log(`Provider: ${this.config.type}`);
    console.log(`Model: ${this.config.modelName}`);
    console.log(`Messages: ${messages.length}`);
    console.log(`Total characters: ${totalChars.toLocaleString()}`);
    console.log(`Estimated tokens: ${estimatedTokens.toLocaleString()}`);
    console.log(`Max tokens (response): ${options?.maxTokens ?? this.config.maxTokens ?? 4096}`);
    console.log(`Temperature: ${options?.temperature ?? this.config.temperature ?? 0.7}`);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.modelName,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: options?.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 4096,
      });

      console.log('=== AI Provider Response ===');
      console.log('Full response:', JSON.stringify(response, null, 2));
      console.log('Response keys:', Object.keys(response));
      console.log('Choices length:', response.choices?.length);
      console.log('First choice:', JSON.stringify(response.choices?.[0], null, 2));

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        console.error('❌ NO CONTENT IN RESPONSE');
        console.error('Choice:', JSON.stringify(choice, null, 2));
        console.error('Message:', JSON.stringify(choice?.message, null, 2));
        console.error('Finish reason:', choice?.finish_reason);
        
        // Check for common reasons
        if (choice?.finish_reason === 'length') {
          throw new Error('Response truncated - reached max_tokens limit. Try increasing maxTokens or reducing input context.');
        }
        if (choice?.finish_reason === 'content_filter') {
          throw new Error('Response blocked by content filter');
        }
        
        throw new Error('No response from AI provider');
      }

      console.log(`✅ Success - Content length: ${choice.message.content.length} chars`);
      if (response.usage) {
        console.log(`Usage: ${response.usage.prompt_tokens} prompt + ${response.usage.completion_tokens} completion = ${response.usage.total_tokens} total tokens`);
      }

      return {
        content: choice.message.content,
        model: response.model,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error: any) {
      console.error('=== AI Provider Error ===');
      console.error('Error type:', error?.constructor?.name);
      console.error('Error message:', error?.message);
      console.error('Error code:', error?.code);
      console.error('Error status:', error?.status);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Check for context length errors
	const errMsg = error?.message?.toLowerCase() || '';
      
      // 1. Check for Rate Limits (TPM/RPM)
      if (errMsg.includes('rate limit') || errMsg.includes('too many requests') || error?.status === 429) {
        throw new Error(`API Rate Limit Exceeded: ${error?.message || 'Wait a moment before trying again.'}`);
      }

      // 2. Check for Billing/Auth issues
      if (errMsg.includes('balance') || errMsg.includes('credit') || error?.status === 402) {
        throw new Error(`API Billing Error: ${error?.message || 'Out of credits.'}`);
      }

      // 3. True Context Length Errors
      if (errMsg.includes('context length') || 
          errMsg.includes('exceeds max') ||
          error?.code === 'context_length_exceeded') {
        throw new Error(`Context too large: ${estimatedTokens.toLocaleString()} estimated tokens. Model: ${this.config.modelName}. Try reducing the input context or using a model with larger context window.`);
      }      
	  throw error;
	 }
    }
  }


/**
 * Get AI provider configuration from database
 */
export async function getAIProviderFromDB(providerType?: string): Promise<AIProviderConfig | null> {
  try {
    // If provider type specified, try to find active provider of that type
    // Otherwise, get the default provider
    const provider = providerType
      ? await prisma.aIProvider.findFirst({
          where: { type: providerType, isActive: true },
          orderBy: { isDefault: 'desc' },
        })
      : await prisma.aIProvider.findFirst({
          where: { isActive: true, isDefault: true },
        });

    if (!provider) {
      console.log(`No database config found for ${providerType || 'default provider'}`);
      return null;
    }

    const config = provider.config as any;
    
    console.log(`Found AI provider in database: ${provider.name} (${provider.type})`);

    return {
      type: provider.type as any,
      baseUrl: provider.baseUrl || undefined,
      apiKey: config?.apiKey || '',
      modelName: provider.modelName,
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 4096,
    };
  } catch (error) {
    console.error('Error fetching AI provider from database:', error);
    return null;
  }
}

/**
 * Factory function to create AI client from provider type
 * First tries to get config from database, falls back to env vars
 */
export async function createAIClient(providerType: string, customConfig?: Partial<AIProviderConfig>): Promise<UnifiedAIClient> {
  // Try to get provider config from database first
  const dbConfig = await getAIProviderFromDB(providerType);

  let config: AIProviderConfig;

  if (dbConfig) {
    // Use database configuration
    config = {
      ...dbConfig,
      ...customConfig,
    };
  } else {
    // Fallback to environment variables
    console.log(`No database config found for ${providerType}, falling back to environment variables`);
    
    switch (providerType) {
      case 'glm':
        config = {
          type: 'glm',
          baseUrl: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
          apiKey: process.env.GLM_API_KEY || '',
          modelName: process.env.GLM_MODEL || 'glm-4-plus',
          temperature: 0.7,
          maxTokens: 4096,
          ...customConfig,
        };
        break;

      case 'openai':
        config = {
          type: 'openai',
          apiKey: process.env.OPENAI_API_KEY || '',
          modelName: 'gpt-4',
          temperature: 0.7,
          maxTokens: 4096,
          ...customConfig,
        };
        break;

      case 'azure':
        config = {
          type: 'azure',
          baseUrl: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
          apiKey: process.env.AZURE_OPENAI_API_KEY || '',
          modelName: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4',
          temperature: 0.7,
          maxTokens: 4096,
          ...customConfig,
        };
        break;

      case 'openrouter':
        config = {
          type: 'openrouter',
          baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
          apiKey: process.env.OPENROUTER_API_KEY || '',
          modelName: 'z-ai/glm-4.6',
          temperature: 0.1,
          maxTokens: 4096,
          ...customConfig,
        };
        break;

      default:
        throw new Error(`Unsupported AI provider type: ${providerType}`);
    }
  }

  /*if (!config.apiKey) {
    throw new Error(`API key not found for provider: ${providerType}. Please configure the provider in settings.`);
  }*/

  return new UnifiedAIClient(config);
}

// Create default client
export async function getDefaultAIClient(): Promise<UnifiedAIClient> {
  // Try to get default provider from database
  const dbConfig = await getAIProviderFromDB();
  
  if (dbConfig) {
    return new UnifiedAIClient(dbConfig);
  }
  
  // Fallback to GLM from environment
  return createAIClient('glm');
}
