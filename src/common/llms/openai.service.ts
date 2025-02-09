import { OpenAI } from 'openai';
import { zodFunction } from 'openai/helpers/zod';

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

  public async generate(messages: LlmMessage[]): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
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
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: tools.map((tool) =>
          zodFunction({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })
        ),
        tool_choice: 'required',
        temperature: this.temperature,
        max_tokens: this.maxTokens,
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
