import { Anthropic, AnthropicError, APIError } from '@anthropic-ai/sdk';
import {
  TextBlock,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages';
import zodToJsonSchema from 'zod-to-json-schema';

import { LlmMessage, LlmService } from './llm.service';
import { LlmApiError, LlmInvalidContentError } from './llm.errors';
import { LlmToolCall } from './llm.tool';
import { LlmTool } from './llm.tool';

export class AnthropicService extends LlmService {
  private client: Anthropic;

  public constructor(
    public readonly model: string,
    protected readonly apiKey: string
  ) {
    super(model, apiKey);
    this.client = new Anthropic({
      apiKey: apiKey,
    });
  }

  public async generate(messages: LlmMessage[]): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        system: messages
          .filter((message) => message.role === 'system')
          .map((message) => {
            return {
              type: 'text',
              text: message.content,
            };
          }),
        messages: messages
          .filter(
            (message) => message.role === 'user' || message.role === 'assistant'
          )
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: message.content,
          })),
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      });

      if (response.content.length === 0) {
        throw new LlmInvalidContentError('Anthropic returned no content');
      }

      return (response.content[0] as TextBlock).text;
    } catch (error) {
      if (error instanceof AnthropicError) {
        if (error instanceof APIError) {
          throw new LlmApiError(error.status, error.message);
        }
        throw new LlmApiError(400, `Anthropic error: ${error.message}`);
      }
      throw error;
    }
  }

  public async useTools(
    messages: LlmMessage[],
    tools: LlmTool[]
  ): Promise<LlmToolCall[]> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        system: messages
          .filter((message) => message.role === 'system')
          .map((message) => {
            return {
              type: 'text',
              text: message.content,
            };
          }),
        tool_choice: {
          type: 'any',
        },
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: zodToJsonSchema(tool.parameters) as Tool.InputSchema,
        })),
        messages: messages
          .filter(
            (message) => message.role === 'user' || message.role === 'assistant'
          )
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: message.content,
          })),
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      });

      if (response.content.length === 0) {
        throw new LlmInvalidContentError('Anthropic returned no content');
      }

      return response.content
        .filter((content) => content.type === 'tool_use')
        .map((content) => {
          const toolUse = content as ToolUseBlock;
          return {
            name: toolUse.name,
            arguments: toolUse.input,
          };
        });
    } catch (error) {
      if (error instanceof AnthropicError) {
        if (error instanceof APIError) {
          throw new LlmApiError(error.status, error.message);
        }
        throw new LlmApiError(400, `Anthropic error: ${error.message}`);
      }
      throw error;
    }
  }
}
