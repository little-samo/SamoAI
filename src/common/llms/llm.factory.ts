import { AnthropicService } from './anthropic.service';
import { GeminiService } from './gemini.service';
import { LlmService } from './llm.service';
import { LlmServiceOptions, LlmPlatform } from './llm.types';
import { OpenAIService } from './openai.service';

export class LlmFactory {
  public static create(options: LlmServiceOptions): LlmService {
    switch (options.platform) {
      case LlmPlatform.OPENAI:
        return new OpenAIService(options);
      case LlmPlatform.ANTHROPIC:
        return new AnthropicService(options);
      case LlmPlatform.GEMINI:
        return new GeminiService(options);
      default:
        throw new Error(`Unsupported LLM platform: ${options.platform}`);
    }
  }
}
