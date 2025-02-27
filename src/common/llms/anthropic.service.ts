import { Anthropic, AnthropicError, APIError } from '@anthropic-ai/sdk';
import {
  MessageParam,
  TextBlock,
  TextBlockParam,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages/messages';
import zodToJsonSchema from 'zod-to-json-schema';
import { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';

import { sleep } from '../utils';

import { LlmMessage, LlmOptions, LlmService } from './llm.service';
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

  private async createMessageWithRetry(
    request: MessageCreateParamsNonStreaming,
    options: {
      maxTries?: number;
      retryDelay?: number;
      verbose?: boolean;
    } = {}
  ) {
    const maxTries = options.maxTries ?? LlmService.DEFAULT_MAX_TRIES;
    const retryDelay = options.retryDelay ?? LlmService.DEFAULT_RETRY_DELAY;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const response = await this.client.beta.messages.create(request);
        if (options.verbose) {
          console.log(response);
          console.log(
            `Anthropic time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`
          );
        }
        return response;
      } catch (error) {
        if (error instanceof APIError) {
          const status = error.status;
          if ([429, 500, 501].includes(status) && attempt < maxTries) {
            await sleep(attempt * retryDelay);
            continue;
          }
        }
        throw error;
      }
    }
    throw new LlmApiError(500, 'Max retry attempts reached');
  }

  private llmMessagesToAnthropicMessages(
    messages: LlmMessage[]
  ): [TextBlockParam[], MessageParam[]] {
    const systemMessages: TextBlockParam[] = [];
    const userAssistantMessages: MessageParam[] = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
        case 'assistant':
          systemMessages.push({
            type: 'text',
            text: message.content,
          });
          break;
        case 'user':
          if (Array.isArray(message.content)) {
            userAssistantMessages.push({
              role: message.role,
              content: message.content.map((content) => {
                switch (content.type) {
                  case 'text':
                    return {
                      type: 'text',
                      text: content.text,
                    };
                  case 'image':
                    return {
                      type: 'image',
                      source: {
                        type: 'base64',
                        data: content.image,
                        media_type: 'image/png',
                      },
                      cache_control: {
                        type: 'ephemeral',
                      },
                    };
                }
              }),
            });
          } else {
            userAssistantMessages.push({
              role: message.role,
              content: message.content,
            });
          }
          break;
      }
    }

    if (systemMessages.length > 0) {
      systemMessages[systemMessages.length - 1].cache_control = {
        type: 'ephemeral',
      };
    }

    return [systemMessages, userAssistantMessages];
  }

  public async generate(
    messages: LlmMessage[],
    options?: LlmOptions
  ): Promise<string> {
    try {
      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToAnthropicMessages(messages);

      const request: MessageCreateParamsNonStreaming = {
        model: this.model,
        system: systemMessages,
        messages: userAssistantMessages,
        max_tokens: options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? LlmService.DEFAULT_TEMPERATURE,
      };
      if (options?.verbose) {
        console.log(request);
      }

      const response = await this.createMessageWithRetry(request, options);

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

  public override async useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolCall[]> {
    try {
      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToAnthropicMessages(messages);

      const toolMessages: Tool[] = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: zodToJsonSchema(tool.parameters) as Tool.InputSchema,
      }));
      toolMessages[toolMessages.length - 1].cache_control = {
        type: 'ephemeral',
      };

      const request: MessageCreateParamsNonStreaming = {
        model: this.model,
        system: systemMessages,
        tools: toolMessages,
        messages: userAssistantMessages,
        max_tokens: options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? LlmService.DEFAULT_TEMPERATURE,
        betas: ['token-efficient-tools-2025-02-19'],
      };
      if (options?.verbose) {
        console.log(request);
      }

      const response = await this.createMessageWithRetry(request, options);

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
