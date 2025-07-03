import { LlmResponseBase } from './llm.types';

export class LlmError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

export class LlmApiError extends LlmError {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'LlmApiError';
  }
}

export class LlmInvalidContentError extends LlmError {
  public constructor(
    message: string,
    public readonly llmResponse?: LlmResponseBase
  ) {
    super(message);
    this.name = 'LlmInvalidContentError';
  }
}
