import { Anthropic, AnthropicError, APIError } from '@anthropic-ai/sdk';
import {
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlock,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';
import zodToJsonSchema from 'zod-to-json-schema';

import { sleep } from '../utils';

import { LlmApiError, LlmInvalidContentError } from './llm.errors';
import { LlmMessage, LlmOptions, LlmService } from './llm.service';
import { LlmToolCall } from './llm.tool';
import { LlmTool } from './llm.tool';

export class AnthropicService extends LlmService {
  private client: Anthropic;

  public constructor(
    public readonly model: string,
    protected readonly apiKey: string,
    options?: {
      reasoning?: boolean;
    }
  ) {
    super(model, apiKey, options);
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
        const response = await this.client.messages.create(request);
        if (options.verbose) {
          console.log(JSON.stringify(response, null, 2));
          console.log(
            `Anthropic time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`
          );
        }
        return response;
      } catch (error) {
        console.error(error);
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
          systemMessages.push({
            type: 'text',
            text: message.content,
          });
          break;
        case 'assistant':
          userAssistantMessages.push({
            role: message.role,
            content: message.content,
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
                    let mediaType = 'image/png';
                    let imageData = content.image;

                    if (content.image.startsWith('data:image/')) {
                      const matches = content.image.match(
                        /^data:([^;]+);base64,(.+)$/
                      );
                      if (matches && matches.length === 3) {
                        mediaType = matches[1];
                        imageData = matches[2];
                      }
                    }

                    return {
                      type: 'image',
                      source: {
                        type: 'base64',
                        data: imageData,
                        media_type: mediaType as
                          | 'image/png'
                          | 'image/jpeg'
                          | 'image/gif'
                          | 'image/webp',
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

    return [systemMessages, userAssistantMessages];
  }

  public async generate(
    messages: LlmMessage[],
    options?: LlmOptions
  ): Promise<string> {
    try {
      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToAnthropicMessages(messages);

      if (systemMessages.length > 0) {
        systemMessages[systemMessages.length - 1].cache_control = {
          type: 'ephemeral',
        };
      }

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
      const assistantMessage = messages.find(
        (message) => message.role === 'assistant'
      );
      messages = messages.filter((message) => message.role !== 'assistant');

      let prefill: string;
      if (this.reasoning) {
        prefill = `[`;
      } else {
        prefill = `[
    {
      "name": "reasoning",
      "arguments": {
        "reasoning": "${assistantMessage?.content?.replace(/\n/g, '\\n') ?? ''}`;
        messages.push({
          role: 'assistant',
          content: prefill,
        });
      }

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToAnthropicMessages(messages);

      systemMessages.push({
        type: 'text',
        text: `The definition of the tools you have can be organized as a JSON Schema as follows. Clearly understand the definition and purpose of each tool.`,
      });

      for (const tool of tools) {
        const parameters = zodToJsonSchema(tool.parameters, {
          target: 'openAi',
        });
        delete parameters['$schema'];
        systemMessages.push({
          type: 'text',
          text: `name: ${tool.name}
description: ${tool.description}
parameters: ${JSON.stringify(parameters)}`,
        });
      }

      systemMessages.push({
        type: 'text',
        text: `Refer to the definitions of the available tools above, and output the tools you plan to use in JSON format. Begin by using the reasoning tool to perform a chain-of-thought analysis. Based on that analysis, select and use the necessary tools from the rest—following the guidance provided in the previous prompt.

Response can only be in JSON format and must strictly follow the following format, with no surrounding text or markdown:
[
  {
    "name": "tool_name",
    "arguments": { ... }
  },
  ... // (Include additional tool calls as needed)
]`,
      });

      systemMessages[systemMessages.length - 1].cache_control = {
        type: 'ephemeral',
      };

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

      const responseText = (response.content[0] as TextBlock).text;
      try {
        const toolCalls = JSON.parse(prefill + responseText) as LlmToolCall[];
        return toolCalls;
      } catch (error) {
        console.error(error);
        console.error(prefill + responseText);
        return [];
      }
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
