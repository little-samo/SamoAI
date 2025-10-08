import { AnthropicService } from './anthropic.service';
import { DeepSeekService } from './deepseek.service';
import { GeminiService } from './gemini.service';
import { LlmService } from './llm.service';
import { LlmServiceOptions, LlmPlatform } from './llm.types';
import { OpenAIService } from './openai.service';
import { OpenRouterService } from './openrouter.service';
import { XAIService } from './xai.service';

export class LlmFactory {
  public static create(options: LlmServiceOptions): LlmService {
    switch (options.platform) {
      case LlmPlatform.OPENAI:
        return new OpenAIService({
          ...options,
          supportThinkingLevel: true,
          supportOutputVerbosity: true,
        });
      case LlmPlatform.ANTHROPIC:
        return new AnthropicService(options);
      case LlmPlatform.GEMINI:
        return new GeminiService(options);
      case LlmPlatform.DEEPSEEK:
        return new DeepSeekService(options);
      case LlmPlatform.XAI:
        return new XAIService(options);
      case LlmPlatform.OPENROUTER:
        return new OpenRouterService(options);
      default:
        throw new Error(`Unsupported LLM platform: ${options.platform}`);
    }
  }
}
