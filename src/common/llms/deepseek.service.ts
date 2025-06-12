import { LlmPlatform, LlmServiceOptions } from './llm.types';
import { OpenAIService } from './openai.service';

export class DeepSeekService extends OpenAIService {
  protected readonly serviceName: string = 'DeepSeek';

  public constructor(options: LlmServiceOptions) {
    super({
      ...options,
      platform: LlmPlatform.DEEPSEEK,
      baseUrl: 'https://api.deepseek.com',
    });
  }
}
