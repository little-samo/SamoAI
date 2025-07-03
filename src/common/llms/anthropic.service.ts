import { Anthropic, AnthropicError, APIError } from '@anthropic-ai/sdk';
import {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  TextBlock,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';

import { sleep, zodSchemaToLlmFriendlyString, parseAndFixJson } from '../utils';

import { LlmApiError, LlmInvalidContentError } from './llm.errors';
import { LlmService } from './llm.service';
import { LlmToolCall } from './llm.tool';
import { LlmTool } from './llm.tool';
import {
  LlmServiceOptions,
  LlmMessage,
  LlmOptions,
  LlmGenerateResponse,
  LlmToolsResponse,
  LlmPlatform,
  LlmResponseBase,
} from './llm.types';

export class AnthropicService extends LlmService {
  private client: Anthropic;

  public constructor(options: LlmServiceOptions) {
    super(options);
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  private async createMessageWithRetry(
    request: MessageCreateParamsNonStreaming,
    options: {
      maxTries?: number;
      retryDelay?: number;
      verbose?: boolean;
    } = {}
  ): Promise<Message> {
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

  public async generate<T extends boolean = false>(
    messages: LlmMessage[],
    options?: LlmOptions & { jsonOutput?: T }
  ): Promise<LlmGenerateResponse<T>> {
    try {
      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToAnthropicMessages(messages);

      if (systemMessages.length > 0) {
        systemMessages[systemMessages.length - 1].cache_control = {
          type: 'ephemeral',
        };
      }

      let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let thinkingBudget: number | undefined;
      let temperature: number | undefined;
      const request: MessageCreateParamsNonStreaming = {
        model: this.model,
        system: systemMessages,
        messages: userAssistantMessages,
        max_tokens: maxOutputTokens,
      };
      if (this.thinking) {
        thinkingBudget =
          options?.maxThinkingTokens ?? LlmService.DEFAULT_MAX_THINKING_TOKENS;
        maxOutputTokens += thinkingBudget;
        request.thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        };
        request.max_tokens = maxOutputTokens;
      } else {
        temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
        request.temperature = temperature;
      }
      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.createMessageWithRetry(request, options);
      const responseTime = Date.now() - startTime;

      const result: LlmResponseBase = {
        platform: LlmPlatform.ANTHROPIC,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        thinkingBudget,
        temperature,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? undefined,
        cacheCreationTokens:
          response.usage.cache_creation_input_tokens ?? undefined,
        request,
        response,
        responseTime,
      };

      const responseText = (
        response.content
          .filter((block) => block.type === 'text')
          .at(0) as TextBlock
      )?.text;
      if (!responseText) {
        throw new LlmInvalidContentError(
          'Anthropic returned no content',
          result
        );
      }

      if (options?.jsonOutput) {
        try {
          const content = parseAndFixJson(responseText);
          return {
            ...result,
            content: content as T extends true
              ? Record<string, unknown>
              : string,
          };
        } catch (error) {
          console.error(error);
          console.error(responseText);
          throw new LlmInvalidContentError(
            'Anthropic returned invalid JSON',
            result
          );
        }
      }
      return {
        ...result,
        content: responseText as T extends true
          ? Record<string, unknown>
          : string,
      };
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
  ): Promise<LlmToolsResponse> {
    try {
      const assistantMessage = messages.find(
        (message) => message.role === 'assistant'
      );
      messages = messages.filter((message) => message.role !== 'assistant');

      let prefill: string = '';
      if (!this.thinking) {
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
        const parameters = zodSchemaToLlmFriendlyString(tool.parameters);
        systemMessages.push({
          type: 'text',
          text: `name: ${tool.name}
description: ${tool.description}
parameters: ${parameters}`,
        });
      }

      systemMessages.push({
        type: 'text',
        text: `Refer to the definitions of the available tools above, and output the tools you plan to use in JSON format. Based on that analysis, select and use the necessary tools from the rest—following the guidance provided in the previous prompt.

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

      let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let thinkingBudget: number | undefined;
      let temperature: number | undefined;
      const request: MessageCreateParamsNonStreaming = {
        model: this.model,
        system: systemMessages,
        messages: userAssistantMessages,
        max_tokens: maxOutputTokens,
      };
      if (this.thinking) {
        thinkingBudget =
          options?.maxThinkingTokens ?? LlmService.DEFAULT_MAX_THINKING_TOKENS;
        maxOutputTokens += thinkingBudget;
        request.thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        };
        request.max_tokens = maxOutputTokens;
      } else {
        temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
        request.temperature = temperature;
      }
      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.createMessageWithRetry(request, options);
      const responseTime = Date.now() - startTime;

      const result: LlmResponseBase = {
        platform: LlmPlatform.ANTHROPIC,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        thinkingBudget,
        temperature,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? undefined,
        cacheCreationTokens:
          response.usage.cache_creation_input_tokens ?? undefined,
        request,
        response,
        responseTime,
      };

      let responseText = (
        response.content
          .filter((block) => block.type === 'text')
          .at(0) as TextBlock
      )?.text;
      if (!responseText) {
        throw new LlmInvalidContentError(
          'Anthropic returned no content',
          result
        );
      }
      responseText = prefill + responseText;

      try {
        const toolCalls = parseAndFixJson<LlmToolCall[]>(responseText);
        return {
          ...result,
          toolCalls,
        };
      } catch (error) {
        console.error(error);
        console.error(responseText);
        throw new LlmInvalidContentError(
          'Anthropic returned invalid JSON',
          result
        );
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
