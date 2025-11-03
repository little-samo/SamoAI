import {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsBase,
} from 'openai/resources/chat/completions';

import { LlmOptions, LlmServiceOptions } from './llm.types';
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

  protected override buildGenerateRequest(
    systemMessages: ChatCompletionMessageParam[],
    userAssistantMessages: ChatCompletionMessageParam[],
    options?: LlmOptions & { jsonOutput?: boolean }
  ): {
    request: ChatCompletionCreateParamsNonStreaming;
    maxOutputTokens: number;
    temperature: number | undefined;
  } {
    if (
      this.model.includes('gemini') &&
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

    // Add Gemini thinking budget support via OpenRouter
    // See: https://openrouter.ai/docs/use-cases/reasoning-tokens
    if (this.model.includes('gemini') && options?.maxThinkingTokens) {
      // @ts-expect-error - OpenRouter supports reasoning for provider-specific parameters
      request.reasoning ??= {};
      // @ts-expect-error - OpenRouter supports reasoning for provider-specific parameters
      request.reasoning.max_tokens = options.maxThinkingTokens;
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
    if (
      this.model.includes('gemini') &&
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

    // Add Gemini thinking budget support via OpenRouter
    // See: https://openrouter.ai/docs/use-cases/reasoning-tokens
    if (this.model.includes('gemini') && options?.maxThinkingTokens) {
      // @ts-expect-error - OpenRouter supports reasoning for provider-specific parameters
      request.reasoning ??= {};
      // @ts-expect-error - OpenRouter supports reasoning for provider-specific parameters
      request.reasoning.max_tokens = options.maxThinkingTokens;
    }

    return { request, maxOutputTokens, temperature };
  }
}
