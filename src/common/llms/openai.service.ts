import { OpenAI } from 'openai';
import {
  ResponseFormatJSONObject,
  ResponseFormatJSONSchema,
  ResponseFormatText,
} from 'openai/resources';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import zodToJsonSchema from 'zod-to-json-schema';

import { sleep, zodSchemaToLlmFriendlyString, parseAndFixJson } from '../utils';

import { LlmApiError } from './llm.errors';
import { LlmInvalidContentError } from './llm.errors';
import { LlmService } from './llm.service';
import { LlmTool, LlmToolCall } from './llm.tool';
import {
  LlmGenerateResponse,
  LlmMessage,
  LlmOptions,
  LlmServiceOptions,
  LlmToolsResponse,
} from './llm.types';

export class OpenAIService extends LlmService {
  private client: OpenAI;
  protected readonly serviceName: string = 'OpenAI';

  public constructor(options: LlmServiceOptions) {
    super(options);
    this.client = new OpenAI({
      apiKey: this.apiKey,
      ...(this.baseUrl && { baseURL: this.baseUrl }),
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
            `${this.serviceName} time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`
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
  ): Promise<LlmGenerateResponse<T>> {
    try {
      // openai does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToOpenAiMessages(messages);

      let responseFormat:
        | ResponseFormatText
        | ResponseFormatJSONObject
        | ResponseFormatJSONSchema;
      if (options?.jsonSchema) {
        responseFormat = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: zodToJsonSchema(options.jsonSchema, {
              target: 'openAi',
            }),
          },
        };
      } else if (options?.jsonOutput) {
        responseFormat = { type: 'json_object' };
      } else {
        responseFormat = { type: 'text' };
      }
      const maxOutputTokens =
        options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let temperature: number | undefined;
      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: [...systemMessages, ...userAssistantMessages],
        max_tokens: maxOutputTokens,
        response_format: responseFormat,
      };
      if (!options?.webSearch) {
        temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
        request.temperature = temperature;
      }
      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.createCompletionWithRetry(request, options);
      const responseTime = Date.now() - startTime;

      const responseText = response.choices[0].message.content;
      if (responseText === null) {
        throw new LlmInvalidContentError(
          `${this.serviceName} returned no content`
        );
      }

      if (options?.jsonOutput) {
        try {
          const content = parseAndFixJson(responseText);
          return {
            content: content as T extends true
              ? Record<string, unknown>
              : string,
            platform: this.platform,
            model: this.model,
            thinking: this.thinking,
            maxOutputTokens,
            temperature,
            inputTokens: response.usage?.prompt_tokens ?? 0,
            outputTokens: response.usage?.completion_tokens ?? 0,
            thinkingTokens:
              response.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
            cachedInputTokens:
              response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
            responseTime,
          };
        } catch (error) {
          console.error(error);
          console.error(responseText);
          throw new LlmInvalidContentError(
            `${this.serviceName} returned invalid JSON`
          );
        }
      }
      return {
        platform: this.platform,
        content: responseText as T extends true
          ? Record<string, unknown>
          : string,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        temperature,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        thinkingTokens:
          response.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        cachedInputTokens:
          response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        responseTime,
      };
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
  ): Promise<LlmToolsResponse> {
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
        const parameters = zodSchemaToLlmFriendlyString(tool.parameters);
        systemMessages.push({
          role: 'system',
          content: `name: ${tool.name}
description: ${tool.description}
parameters: ${parameters}`,
        });
      }

      systemMessages.push({
        role: 'system',
        content: `Refer to the definitions of the available tools above, and output the tools you plan to use in JSON format. Based on that analysis, select and use the necessary tools from the rest—following the guidance provided in the previous prompt.

Response can only be in JSON format and must strictly follow the following format, with no surrounding text or markdown:
[
  {
    "name": "tool_name",
    "arguments": { ... }
  },
  ... // (Include additional tool calls as needed)
]`,
      });

      const maxOutputTokens =
        options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let temperature: number | undefined;
      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: [...systemMessages, ...userAssistantMessages],
        max_tokens: maxOutputTokens,
        response_format: { type: 'text' },
      };
      if (!options?.webSearch) {
        temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
        request.temperature = temperature;
      }
      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.createCompletionWithRetry(request, options);
      const responseTime = Date.now() - startTime;

      if (response.choices.length === 0) {
        throw new LlmInvalidContentError(
          `${this.serviceName} returned no choices`
        );
      }

      const responseText = response.choices[0].message.content;
      if (responseText === null) {
        throw new LlmInvalidContentError(
          `${this.serviceName} returned no content`
        );
      }

      try {
        const toolCalls = parseAndFixJson<LlmToolCall[]>(responseText);
        return {
          toolCalls,
          platform: this.platform,
          model: this.model,
          thinking: this.thinking,
          maxOutputTokens,
          temperature,
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          thinkingTokens:
            response.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          cachedInputTokens:
            response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          responseTime,
        };
      } catch (error) {
        console.error(error);
        console.error(responseText);
        throw new LlmInvalidContentError(
          `${this.serviceName} returned invalid JSON`
        );
      }
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LlmApiError(error.status, error.message);
      }
      throw error;
    }
  }
}
