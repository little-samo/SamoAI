import { OpenAI } from 'openai';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import zodToJsonSchema from 'zod-to-json-schema';

import { sleep } from '../utils';

import { LlmApiError } from './llm.errors';
import { LlmInvalidContentError } from './llm.errors';
import { LlmService } from './llm.service';
import { LlmTool, LlmToolCall } from './llm.tool';
import { LlmMessage, LlmOptions, LlmServiceOptions } from './llm.types';

export class OpenAIService extends LlmService {
  private client: OpenAI;

  public constructor(options: LlmServiceOptions) {
    super(options);
    this.client = new OpenAI({
      apiKey: this.apiKey,
    });
  }

  private async createCompletionWithRetry(
    request: ChatCompletionCreateParamsNonStreaming,
    options: { maxTries?: number; retryDelay?: number; verbose?: boolean } = {}
  ) {
    const maxTries = options.maxTries ?? LlmService.DEFAULT_MAX_TRIES;
    const retryDelay = options.retryDelay ?? LlmService.DEFAULT_RETRY_DELAY;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const response = await this.client.chat.completions.create(request);
        if (options.verbose) {
          console.log(JSON.stringify(response, null, 2));
          console.log(
            `OpenAI time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`
          );
        }
        return response;
      } catch (error) {
        console.error(error);
        if (error instanceof OpenAI.APIError) {
          const status = error.status;
          if ([429, 500, 503].includes(status) && attempt < maxTries) {
            await sleep(attempt * retryDelay);
            continue;
          }
        } else if (
          error instanceof Error &&
          error.message.includes('ECONNRESET')
        ) {
          await sleep(attempt * retryDelay);
          continue;
        }
        throw error;
      }
    }
    throw new LlmApiError(500, 'Max retry attempts reached');
  }

  private llmMessagesToOpenAiMessages(
    messages: LlmMessage[]
  ): [ChatCompletionMessageParam[], ChatCompletionMessageParam[]] {
    const systemMessages: ChatCompletionMessageParam[] = [];
    const userAssistantMessages: ChatCompletionMessageParam[] = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          systemMessages.push(message);
          break;
        case 'assistant':
          userAssistantMessages.push(message);
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
                      type: 'image_url',
                      image_url: {
                        url: `data:${mediaType};base64,${imageData}`,
                      },
                    };
                }
              }),
            });
            break;
          } else {
            userAssistantMessages.push({
              role: message.role,
              content: message.content,
            });
            break;
          }
      }
    }

    return [systemMessages, userAssistantMessages];
  }

  public async generate<T extends boolean = false>(
    messages: LlmMessage[],
    options?: LlmOptions & { jsonOutput?: T }
  ): Promise<T extends true ? Record<string, unknown> : string> {
    try {
      // openai does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToOpenAiMessages(messages);

      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: [...systemMessages, ...userAssistantMessages],
        temperature: options?.temperature ?? LlmService.DEFAULT_TEMPERATURE,
        max_tokens: options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS,
        response_format: { type: options?.jsonOutput ? 'json_object' : 'text' },
      };
      if (options?.verbose) {
        console.log(request);
      }

      const response = await this.createCompletionWithRetry(request, options);

      if (response.choices[0].message.content === null) {
        throw new LlmInvalidContentError('OpenAI returned no content');
      }

      const responseText = response.choices[0].message.content;
      if (options?.jsonOutput) {
        try {
          return JSON.parse(responseText) as T extends true
            ? Record<string, unknown>
            : string;
        } catch (error) {
          console.error(error);
          console.error(responseText);
          throw new LlmInvalidContentError('OpenAI returned invalid JSON');
        }
      }
      return responseText as T extends true ? Record<string, unknown> : string;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LlmApiError(error.status, error.message);
      }
      throw error;
    }
  }

  public async useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolCall[]> {
    try {
      // openai does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToOpenAiMessages(messages);

      systemMessages.push({
        role: 'system',
        content: `The definition of the tools you have can be organized as a JSON Schema as follows. Clearly understand the definition and purpose of each tool.`,
      });

      for (const tool of tools) {
        const parameters = zodToJsonSchema(tool.parameters, {
          target: 'openAi',
        });
        delete parameters['$schema'];
        systemMessages.push({
          role: 'system',
          content: `name: ${tool.name}
description: ${tool.description}
parameters: ${JSON.stringify(parameters)}`,
        });
      }

      systemMessages.push({
        role: 'system',
        content: `Refer to the definitions of the available tools above, and output the tools you plan to use in JSON format. Begin by using the reasoning tool to perform a chain-of-thought analysis. Based on that analysis, select and use the necessary tools from the rest—following the guidance provided in the previous prompt.

Response can only be in JSON format and must strictly follow the following format, with no surrounding text or markdown:
[
  {
    "name": "tool_name",
    "arguments": { ... }
  },
  ... // (Include additional tool calls as needed)
]`,
      });

      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: [...systemMessages, ...userAssistantMessages],
        temperature: options?.webSearch
          ? undefined
          : (options?.temperature ?? LlmService.DEFAULT_TEMPERATURE),
        max_tokens: options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS,
        response_format: { type: 'json_object' },
      };
      if (options?.verbose) {
        console.log(request);
      }

      const response = await this.createCompletionWithRetry(request, options);

      if (response.choices.length === 0) {
        throw new LlmInvalidContentError('OpenAI returned no choices');
      }

      const responseText = response.choices[0].message.content;
      if (responseText === null) {
        throw new LlmInvalidContentError('OpenAI returned no content');
      }

      try {
        const toolCalls = JSON.parse(responseText) as LlmToolCall[];
        return toolCalls;
      } catch (error) {
        console.error(error);
        console.error(responseText);
        return [];
      }
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LlmApiError(error.status, error.message);
      }
      throw error;
    }
  }
}
