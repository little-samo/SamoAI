import { AnthropicService } from './anthropic.service';
import { DeepSeekService } from './deepseek.service';
import { GeminiService } from './gemini.service';
import { LlmService } from './llm.service';
import { LlmServiceOptions, LlmPlatform } from './llm.types';
import { OpenAIService } from './openai.service';
import { OpenRouterService } from './openrouter.service';
import { VLLMService } from './vllm.service';
import { XAIService } from './xai.service';

export interface LlmApiKeyOptions {
  key?: string;
  baseUrl?: string | null;
  geminiVertexai?: boolean | null;
  geminiVertexaiProject?: string | null;
  geminiVertexaiLocation?: string | null;
}

export class LlmFactory {
  public static create(
    options: LlmServiceOptions,
    apiKeyModel?: LlmApiKeyOptions
  ): LlmService {
    // Merge API key model options with provided options
    const mergedOptions: LlmServiceOptions = {
      ...options,
      apiKey: options.apiKey ?? apiKeyModel?.key ?? '',
      baseUrl: options.baseUrl ?? apiKeyModel?.baseUrl ?? undefined,
      geminiVertexai:
        options.geminiVertexai ?? apiKeyModel?.geminiVertexai ?? undefined,
      geminiVertexaiProject:
        options.geminiVertexaiProject ??
        apiKeyModel?.geminiVertexaiProject ??
        undefined,
      geminiVertexaiLocation:
        options.geminiVertexaiLocation ??
        apiKeyModel?.geminiVertexaiLocation ??
        undefined,
    };

    switch (mergedOptions.platform) {
      case LlmPlatform.OPENAI:
        return new OpenAIService({
          ...mergedOptions,
          supportThinkingLevel: true,
          supportOutputVerbosity: true,
        });
      case LlmPlatform.ANTHROPIC:
        return new AnthropicService(mergedOptions);
      case LlmPlatform.GEMINI:
        return new GeminiService(mergedOptions);
      case LlmPlatform.DEEPSEEK:
        return new DeepSeekService(mergedOptions);
      case LlmPlatform.XAI:
        return new XAIService(mergedOptions);
      case LlmPlatform.OPENROUTER:
        return new OpenRouterService(mergedOptions);
      case LlmPlatform.VLLM:
        return new VLLMService(mergedOptions);
      default:
        throw new Error(`Unsupported LLM platform: ${mergedOptions.platform}`);
    }
  }
}
