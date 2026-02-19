export type AIProviderType = 'glm' | 'openai' | 'azure' | 'openrouter';

export interface AIProviderConfig {
  type: AIProviderType;
  baseUrl?: string;
  apiKey: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIClient {
  chat(messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<ChatCompletionResponse>;
}
