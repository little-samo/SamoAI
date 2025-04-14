import { LlmTool, LlmToolCall } from './llm.tool';
import {
  LlmMessage,
  LlmOptions,
  LlmPlatform,
  LlmServiceOptions,
} from './llm.types';

export abstract class LlmService {
  public static readonly DEFAULT_TEMPERATURE = 0;
  public static readonly DEFAULT_MAX_TOKENS = 1024;
  public static readonly DEFAULT_MAX_TRIES = 5;
  public static readonly DEFAULT_RETRY_DELAY = 1000;

  public readonly platform: LlmPlatform;
  public readonly model: string;
  public readonly apiKey: string;
  public readonly reasoning: boolean;

  public constructor(options: LlmServiceOptions) {
    this.model = options.model;
    this.platform = options.platform;
    this.apiKey = options.apiKey;
    this.reasoning = options.reasoning ?? false;
  }

  public abstract generate<T extends boolean = false>(
    messages: LlmMessage[],
    options?: LlmOptions & { jsonOutput?: T }
  ): Promise<T extends true ? Record<string, unknown> : string>;

  public abstract useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolCall[]>;
}
