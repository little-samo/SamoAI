import { MediaResolution } from '@google/genai';
import {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsBase,
} from 'openai/resources/chat/completions';

import { LlmMediaResolution, LlmOptions, LlmServiceOptions } from './llm.types';
import { OpenAIChatCompletionService } from './openai.chat-completion-service';

export class OpenRouterService extends OpenAIChatCompletionService {
  protected override readonly serviceName: string = 'OpenRouter';

  public constructor(options: LlmServiceOptions) {
    // OpenRouter uses OpenAI-compatible API
    const openRouterOptions: LlmServiceOptions = {
      ...options,
      baseUrl: options.baseUrl ?? 'https://openrouter.ai/api/v1',
    };
    super(openRouterOptions);
  }

  private mapMediaResolution(resolution: LlmMediaResolution): MediaResolution {
    // Map our LlmMediaResolution to Gemini's MediaResolution
    switch (resolution) {
      case 'low':
        return MediaResolution.MEDIA_RESOLUTION_LOW;
      case 'medium':
        return MediaResolution.MEDIA_RESOLUTION_MEDIUM;
      case 'high':
        return MediaResolution.MEDIA_RESOLUTION_HIGH;
    }
  }

  protected override buildGenerateRequest(
    systemMessages: ChatCompletionMessageParam[],
    userAssistantMessages: ChatCompletionMessageParam[],
    options?: LlmOptions & { jsonOutput?: boolean }
  ): {
    request: ChatCompletionCreateParamsNonStreaming;
    maxOutputTokens: number;
    temperature: number | undefined;
  } {
    // gemini-3 models use thinkingLevel instead of maxThinkingTokens
    const isGemini3 = this.model.includes('gemini-3');

    if (
      this.model.includes('gemini') &&
      !isGemini3 &&
      options &&
      options.maxTokens &&
      options.maxThinkingTokens
    ) {
      options.maxTokens += options.maxThinkingTokens;
    }

    const { request, maxOutputTokens, temperature } =
      super.buildGenerateRequest(
        systemMessages,
        userAssistantMessages,
        options
      );

    // Add Gemini thinking support via OpenRouter
    // See: https://openrouter.ai/docs/use-cases/reasoning-tokens
    if (this.model.includes('gemini')) {
      if (isGemini3) {
        // gemini-3 models recommend using default temperature
        if (request.temperature !== undefined) {
          delete request.temperature;
        }
        if (options?.thinkingLevel) {
          // gemini-3 models support thinkingLevel using GPT-style reasoning_effort
          request.reasoning_effort = options.thinkingLevel;
        }
        if (options?.mediaResolution) {
          // @ts-expect-error - OpenRouter supports media resolution for provider-specific parameters
          request.extra_body ??= {};
          // @ts-expect-error - OpenRouter supports media resolution for provider-specific parameters
          request.extra_body.media_resolution = this.mapMediaResolution(
            options.mediaResolution
          );
        }
      } else {
        if (options?.maxThinkingTokens) {
          // Older Gemini models use thinking budget
          // @ts-expect-error - OpenRouter supports reasoning for provider-specific parameters
          request.reasoning ??= {};
          // @ts-expect-error - OpenRouter supports reasoning for provider-specific parameters
          request.reasoning.max_tokens = options.maxThinkingTokens;
        }
      }
    }

    return { request, maxOutputTokens, temperature };
  }

  protected override buildToolsRequest(
    systemMessages: ChatCompletionMessageParam[],
    userAssistantMessages: ChatCompletionMessageParam[],
    options?: LlmOptions
  ): {
    request: ChatCompletionCreateParamsBase;
    maxOutputTokens: number;
    temperature: number | undefined;
  } {
    // gemini-3 models use thinkingLevel instead of maxThinkingTokens
    const isGemini3 = this.model.includes('gemini-3');

    if (
      this.model.includes('gemini') &&
      !isGemini3 &&
      options &&
      options.maxTokens &&
      options.maxThinkingTokens
    ) {
      options.maxTokens += options.maxThinkingTokens;
    }

    const { request, maxOutputTokens, temperature } = super.buildToolsRequest(
      systemMessages,
      userAssistantMessages,
      options
    );

    // Add Gemini thinking support via OpenRouter
    // See: https://openrouter.ai/docs/use-cases/reasoning-tokens
    if (this.model.includes('gemini')) {
      if (isGemini3) {
        // gemini-3 models recommend using default temperature
        if (request.temperature !== undefined) {
          delete request.temperature;
        }
        if (options?.thinkingLevel) {
          // gemini-3 models support thinkingLevel using GPT-style reasoning_effort
          request.reasoning_effort = options.thinkingLevel;
        }
        if (options?.mediaResolution) {
          // @ts-expect-error - OpenRouter supports media resolution for provider-specific parameters
          request.extra_body ??= {};
          // @ts-expect-error - OpenRouter supports media resolution for provider-specific parameters
          request.extra_body.media_resolution = this.mapMediaResolution(
            options.mediaResolution
          );
        }
      } else {
        if (options?.maxThinkingTokens) {
          // Older Gemini models use thinking budget
          // @ts-expect-error - OpenRouter supports reasoning for provider-specific parameters
          request.reasoning ??= {};
          // @ts-expect-error - OpenRouter supports reasoning for provider-specific parameters
          request.reasoning.max_tokens = options.maxThinkingTokens;
        }
      }
    }

    return { request, maxOutputTokens, temperature };
  }
}
