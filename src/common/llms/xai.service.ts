import { LlmPlatform, LlmServiceOptions } from './llm.types';
import { OpenAIChatCompletionService } from './openai.chat-completion-service';

export class XAIService extends OpenAIChatCompletionService {
  protected readonly serviceName: string = 'XAI';

  public constructor(options: LlmServiceOptions) {
    super({
      ...options,
      platform: LlmPlatform.XAI,
      baseUrl: 'https://api.x.ai/v1',
    });
  }
}
