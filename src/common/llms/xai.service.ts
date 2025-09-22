import { LlmPlatform, LlmServiceOptions } from './llm.types';
import { OpenAIService } from './openai.service';

export class XAIService extends OpenAIService {
  protected readonly serviceName: string = 'XAI';

  public constructor(options: LlmServiceOptions) {
    super({
      ...options,
      platform: LlmPlatform.XAI,
      baseUrl: 'https://api.x.ai/v1',
    });
  }
}
