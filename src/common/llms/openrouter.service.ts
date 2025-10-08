import { LlmServiceOptions } from './llm.types';
import { OpenAIService } from './openai.service';

export class OpenRouterService extends OpenAIService {
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
