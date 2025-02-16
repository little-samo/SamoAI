import { LlmTool, LlmToolCall } from './llm.tool';

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  maxTries?: number;
  retryDelay?: number;
}

export abstract class LlmService {
  public static readonly DEFAULT_TEMPERATURE = 0;
  public static readonly DEFAULT_MAX_TOKENS = 1024;
  public static readonly DEFAULT_MAX_TRIES = 5;
  public static readonly DEFAULT_RETRY_DELAY = 1000;

  public constructor(
    public readonly model: string,
    protected readonly apiKey: string
  ) {}

  public abstract generate(
    messages: LlmMessage[],
    options?: LlmOptions
  ): Promise<string>;

  public abstract useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolCall[]>;
}
