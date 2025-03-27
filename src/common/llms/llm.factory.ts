import { LlmService } from './llm.service';
import { AnthropicService } from './anthropic.service';
import { OpenAIService } from './openai.service';
import { LlmPlatform } from './llm.types';
import { GeminiService } from './gemini.service';

export class LlmFactory {
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
      case LlmPlatform.GEMINI:
        return new GeminiService(model, apiKey);
      default:
        throw new Error(`Unsupported LLM platform: ${llmPlatform}`);
    }
  }
}
