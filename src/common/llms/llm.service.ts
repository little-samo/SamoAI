import { LlmTool, LlmToolCall } from './llm.tool';

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export abstract class LlmService {
  public temperature: number = 0;
  public maxTokens: number = 1024;

  public constructor(
    public readonly model: string,
    protected readonly apiKey: string
  ) {}

  public abstract generate(messages: LlmMessage[]): Promise<string>;

  public abstract useTools(
    messages: LlmMessage[],
    tools: LlmTool[]
  ): Promise<LlmToolCall[]>;
}
