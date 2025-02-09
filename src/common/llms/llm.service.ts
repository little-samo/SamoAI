import { LlmPlatform } from '@prisma/client';

import { LlmTool, LlmToolCall } from './llm.tool';
import { AnthropicService } from './anthropic.service';
import { OpenAIService } from './openai.service';

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export abstract class LlmService {
  public temperature: number = 0;
  public maxTokens: number = 1024;

  public static create(
    llmPlatform: LlmPlatform,
    model: string,
    apiKey: string
  ): LlmService {
    switch (llmPlatform) {
      case LlmPlatform.OPENAI:
        return new OpenAIService(model, apiKey);
      case LlmPlatform.ANTHROPIC:
        return new AnthropicService(model, apiKey);
      default:
        throw new Error(`Unsupported LLM platform: ${llmPlatform}`);
    }
  }

  public constructor(
    public readonly model: string,
    protected readonly apiKey: string
  ) {}

  public abstract generate(messages: LlmMessage[]): Promise<string>;

  public abstract useTools(
    messages: LlmMessage[],
    tools: LlmTool[]
  ): Promise<LlmToolCall[]>;
}
