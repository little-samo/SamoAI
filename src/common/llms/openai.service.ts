import { OpenAI } from 'openai';
import { zodFunction } from 'openai/helpers/zod';
import { ENV } from '@common/config';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { sleep } from '@common/utils/sleep';

import { LlmMessage, LlmService } from './llm.service';
import { LlmApiError } from './llm.errors';
import { LlmInvalidContentError } from './llm.errors';
import { LlmTool, LlmToolCall } from './llm.tool';

export class OpenAIService extends LlmService {
  private client: OpenAI;

  public constructor(
    public readonly model: string,
    protected readonly apiKey: string
  ) {
    super(model, apiKey);
    this.client = new OpenAI({
      apiKey: apiKey,
    });
  }

  private async createCompletionWithRetry(
    request: ChatCompletionCreateParamsNonStreaming,
    options: { maxTries?: number; retryDelay?: number } = {}
  ) {
    const maxTries = options.maxTries ?? 5;
    const retryDelay = options.retryDelay ?? 1000;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const response = await this.client.chat.completions.create(request);
        if (ENV.DEBUG) {
          console.log(response);
          console.log(
            `OpenAI time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`
          );
        }
        return response;
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          const status = error.status;
          if ([429, 500, 503].includes(status) && attempt < maxTries) {
            await sleep(attempt * retryDelay);
            continue;
          }
        }
        throw error;
      }
    }
    throw new LlmApiError(500, 'Max retry attempts reached');
  }

  public async generate(messages: LlmMessage[]): Promise<string> {
    try {
      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      };
      if (ENV.DEBUG) {
        console.log(request);
      }

      const response = await this.createCompletionWithRetry(request, {
        maxTries: 5,
        retryDelay: 1000,
      });

      if (response.choices[0].message.content === null) {
        throw new LlmInvalidContentError('OpenAI returned no content');
      }

      return response.choices[0].message.content;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LlmApiError(error.status, error.message);
      }
      throw error;
    }
  }

  public async useTools(
    messages: LlmMessage[],
    tools: LlmTool[]
  ): Promise<LlmToolCall[]> {
    try {
      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages,
        tools: tools.map((tool) =>
          zodFunction({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })
        ),
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      };
      if (ENV.DEBUG) {
        console.log(request);
      }

      const response = await this.createCompletionWithRetry(request, {
        maxTries: 5,
        retryDelay: 1000,
      });

      if (response.choices.length === 0) {
        throw new LlmInvalidContentError('OpenAI returned no choices');
      }
      if (!response.choices[0].message.tool_calls) {
        throw new LlmInvalidContentError('OpenAI returned no tool calls');
      }

      return response.choices[0].message.tool_calls.map((toolCall) => {
        return {
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
        };
      });
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LlmApiError(error.status, error.message);
      }
      throw error;
    }
  }
}
