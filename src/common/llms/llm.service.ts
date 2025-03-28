import { LlmTool, LlmToolCall } from './llm.tool';

export interface LlmMessageImageContent {
  type: 'image';
  image: string;
}

export interface LlmMessageTextContent {
  type: 'text';
  text: string;
}

export type LlmMessageContent = LlmMessageImageContent | LlmMessageTextContent;

export interface LlmUserMessage {
  role: 'user';
  content: string | LlmMessageContent[];
}

export interface LlmAssistantMessage {
  role: 'assistant';
  content: string;
}

export interface LlmSystemMessage {
  role: 'system';
  content: string;
}

export type LlmMessage =
  | LlmUserMessage
  | LlmAssistantMessage
  | LlmSystemMessage;

export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  maxTries?: number;
  retryDelay?: number;
  maxToolCalls?: number;
  jsonOutput?: boolean;
  verbose?: boolean;
}

export abstract class LlmService {
  public static readonly DEFAULT_TEMPERATURE = 0;
  public static readonly DEFAULT_MAX_TOKENS = 1024;
  public static readonly DEFAULT_MAX_TRIES = 5;
  public static readonly DEFAULT_RETRY_DELAY = 1000;

  public readonly reasoning: boolean;

  public constructor(
    public readonly model: string,
    protected readonly apiKey: string,
    options?: {
      reasoning?: boolean;
    }
  ) {
    this.reasoning = options?.reasoning ?? false;
  }

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
