import { LlmServiceOptions } from './llm.types';
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
}
