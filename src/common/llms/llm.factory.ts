import { AnthropicService } from './anthropic.service';
import { GeminiService } from './gemini.service';
import { LlmService } from './llm.service';
import { LlmPlatform } from './llm.types';
import { OpenAIService } from './openai.service';

export class LlmFactory {
  public static create(
    llmPlatform: LlmPlatform,
    model: string,
    apiKey: string,
    options?: {
      reasoning?: boolean;
    }
  ): LlmService {
    switch (llmPlatform) {
      case LlmPlatform.OPENAI:
        return new OpenAIService(model, apiKey, options);
      case LlmPlatform.ANTHROPIC:
        return new AnthropicService(model, apiKey, options);
      case LlmPlatform.GEMINI:
        return new GeminiService(model, apiKey, options);
      default:
        throw new Error(`Unsupported LLM platform: ${llmPlatform}`);
    }
  }
}
