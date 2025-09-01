import { LlmPlatform, LlmServiceOptions } from './llm.types';
import { OpenAIChatCompletionService } from './openai.chat-completion-service';

export class DeepSeekService extends OpenAIChatCompletionService {
  protected readonly serviceName: string = 'DeepSeek';

  public constructor(options: LlmServiceOptions) {
    super({
      ...options,
      platform: LlmPlatform.DEEPSEEK,
      baseUrl: 'https://api.deepseek.com',
    });
  }
}
