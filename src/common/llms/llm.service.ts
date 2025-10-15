import { LlmTool } from './llm.tool';
import {
  LlmMessage,
  LlmOptions,
  LlmPlatform,
  LlmServiceOptions,
  LlmGenerateResponse,
  LlmToolsResponse,
  LlmToolsStreamEvent,
} from './llm.types';

export abstract class LlmService {
  public static readonly DEFAULT_TEMPERATURE = 0;
  public static readonly DEFAULT_MAX_TOKENS = 1024;
  public static readonly DEFAULT_MAX_THINKING_TOKENS = 1024;
  public static readonly DEFAULT_MAX_TRIES = 5;
  public static readonly DEFAULT_RETRY_DELAY = 1000;

  public readonly platform: LlmPlatform;
  public readonly model: string;
  public readonly thinking: boolean;

  public readonly disableResponseFormat: boolean;
  public readonly supportThinkingLevel: boolean;
  public readonly supportOutputVerbosity: boolean;

  public constructor(public readonly options: LlmServiceOptions) {
    this.model = options.model;
    this.platform = options.platform;
    this.thinking = options.thinking ?? false;

    this.disableResponseFormat = options.disableResponseFormat ?? false;
    this.supportThinkingLevel = options.supportThinkingLevel ?? false;
    this.supportOutputVerbosity = options.supportOutputVerbosity ?? false;
  }

  public abstract generate<T extends boolean = false>(
    messages: LlmMessage[],
    options?: LlmOptions & { jsonOutput?: T }
  ): Promise<LlmGenerateResponse<T>>;

  public abstract useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolsResponse>;

  public abstract useToolsStream(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): AsyncGenerator<LlmToolsStreamEvent, LlmToolsResponse>;
}
