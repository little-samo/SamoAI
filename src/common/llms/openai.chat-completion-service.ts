import { OpenAI } from 'openai';
import {
  ResponseFormatJSONObject,
  ResponseFormatJSONSchema,
  ResponseFormatText,
} from 'openai/resources';
import {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionChunk,
  ChatCompletionCreateParamsBase,
} from 'openai/resources/chat/completions';
import zodToJsonSchema from 'zod-to-json-schema';

import {
  sleep,
  zodSchemaToLlmFriendlyString,
  parseAndFixJson,
  JsonArrayStreamParser,
  PartialFieldUpdate,
} from '../utils';

import { LlmApiError } from './llm.errors';
import { LlmInvalidContentError } from './llm.errors';
import { LlmService } from './llm.service';
import { LlmTool, LlmToolCall } from './llm.tool';
import {
  LlmGenerateResponse,
  LlmGenerateResponseWebSearchSource,
  LlmMessage,
  LlmOptions,
  LlmResponseBase,
  LlmServiceOptions,
  LlmToolsResponse,
  LlmToolsStreamEvent,
} from './llm.types';

export class OpenAIChatCompletionService extends LlmService {
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
                    if (content.image.startsWith('data:image/')) {
                      let mediaType = 'image/png';
                      let imageData = content.image;
                      const matches = content.image.match(
                        /^data:([^;]+);base64,(.+)$/
                      );
                      if (matches && matches.length === 3) {
                        mediaType = matches[1];
                        imageData = matches[2];
                      }

                      return {
                        type: 'image_url',
                        image_url: {
                          url: `data:${mediaType};base64,${imageData}`,
                        },
                      };
                    } else {
                      return {
                        type: 'image_url',
                        image_url: {
                          url: content.image,
                        },
                      };
                    }
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
        | ResponseFormatJSONSchema
        | undefined;
      if (!this.disableResponseFormat) {
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
      }
      let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let temperature: number | undefined;
      const request: ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: [...systemMessages, ...userAssistantMessages],
        max_completion_tokens: maxOutputTokens,
        ...(responseFormat && { response_format: responseFormat }),
      };
      // web search models and gpt-5 do not support temperature
      if (!options?.webSearch && !this.model.startsWith('gpt-5')) {
        temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
        request.temperature = temperature;
      }
      if (this.thinking && options?.thinkingLevel) {
        // add thinking tokens to max output tokens until thinking budget is supported
        maxOutputTokens +=
          options?.maxThinkingTokens ?? LlmService.DEFAULT_MAX_THINKING_TOKENS;
        if (this.supportThinkingLevel && options?.thinkingLevel) {
          request.reasoning_effort = options.thinkingLevel;
        }
        if (this.supportOutputVerbosity && options?.outputVerbosity) {
          request.verbosity = options.outputVerbosity;
        }
      }
      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.createCompletionWithRetry(request, options);
      const responseTime = Date.now() - startTime;

      const result: LlmResponseBase = {
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
        request,
        response,
        responseTime,
      };

      const responseText = response.choices.at(0)?.message.content;
      if (!responseText) {
        if (response.choices.at(0)?.finish_reason === 'content_filter') {
          throw new LlmInvalidContentError(
            `${this.serviceName} refused to generate content. Try again with a different message.`,
            result
          );
        }
        throw new LlmInvalidContentError(
          `${this.serviceName} returned no content. Try again with a different message.`,
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
            `${this.serviceName} returned invalid JSON`,
            result
          );
        }
      }

      let sources: LlmGenerateResponseWebSearchSource[] | undefined;
      if (options?.webSearch) {
        sources = [];
        const annotations = response.choices[0].message.annotations;
        if (annotations) {
          for (const annotation of annotations) {
            if (annotation.type === 'url_citation') {
              const urlCitation = annotation.url_citation;
              sources.push({
                url: urlCitation.url,
                title: urlCitation.title,
                startIndex: urlCitation.start_index,
                endIndex: urlCitation.end_index,
                content: responseText.substring(
                  urlCitation.start_index,
                  urlCitation.end_index
                ),
              });
            }
          }
        }
      }

      return {
        ...result,
        content: responseText as T extends true
          ? Record<string, unknown>
          : string,
        sources,
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LlmApiError(error.status, error.message);
      }
      throw error;
    }
  }

  private prepareToolsSystemMessages(
    systemMessages: ChatCompletionMessageParam[],
    tools: LlmTool[]
  ): void {
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
  }

  private buildToolsRequest(
    systemMessages: ChatCompletionMessageParam[],
    userAssistantMessages: ChatCompletionMessageParam[],
    options?: LlmOptions
  ): {
    request: ChatCompletionCreateParamsBase;
    maxOutputTokens: number;
    temperature: number | undefined;
  } {
    let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
    let temperature: number | undefined;
    const request: ChatCompletionCreateParams = {
      model: this.model,
      messages: [...systemMessages, ...userAssistantMessages],
      max_completion_tokens: maxOutputTokens,
      ...(!this.disableResponseFormat && {
        response_format: { type: 'text' as const },
      }),
    };
    // web search models and gpt-5 do not support temperature
    if (!options?.webSearch && !this.model.startsWith('gpt-5')) {
      temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
      request.temperature = temperature;
    }
    if (this.thinking) {
      // add thinking tokens to max output tokens until thinking budget is supported
      maxOutputTokens +=
        options?.maxThinkingTokens ?? LlmService.DEFAULT_MAX_THINKING_TOKENS;
      if (this.supportThinkingLevel && options?.thinkingLevel) {
        request.reasoning_effort = options.thinkingLevel;
      }
      if (this.supportOutputVerbosity && options?.outputVerbosity) {
        request.verbosity = options.outputVerbosity;
      }
    }
    return { request, maxOutputTokens, temperature };
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

      this.prepareToolsSystemMessages(systemMessages, tools);

      const { request, maxOutputTokens, temperature } = this.buildToolsRequest(
        systemMessages,
        userAssistantMessages,
        options
      );

      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.createCompletionWithRetry(
        request as ChatCompletionCreateParamsNonStreaming,
        options
      );
      const responseTime = Date.now() - startTime;

      const result: LlmResponseBase = {
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
        request,
        response,
        responseTime,
      };

      const responseText = response.choices.at(0)?.message.content;
      if (!responseText) {
        if (response.choices.at(0)?.finish_reason === 'content_filter') {
          throw new LlmInvalidContentError(
            `${this.serviceName} refused to generate content. Try again with a different message.`,
            result
          );
        }
        return {
          ...result,
          toolCalls: [],
        };
      }

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
          `${this.serviceName} returned invalid JSON`,
          result
        );
      }
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LlmApiError(error.status, error.message);
      }
      throw error;
    }
  }

  public async *useToolsStream(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): AsyncGenerator<LlmToolsStreamEvent, LlmToolsResponse> {
    try {
      // openai does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToOpenAiMessages(messages);

      this.prepareToolsSystemMessages(systemMessages, tools);

      const { request, maxOutputTokens, temperature } = this.buildToolsRequest(
        systemMessages,
        userAssistantMessages,
        options
      );
      request.stream = true;
      request.stream_options = {
        include_usage: true,
      };

      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const stream = await this.client.chat.completions.create(
        request as ChatCompletionCreateParamsStreaming
      );

      const parser = new JsonArrayStreamParser();
      const fieldUpdateQueue: PartialFieldUpdate[] = [];

      // Set up field tracking for message streaming
      if (options?.trackToolFields && options.trackToolFields.length > 0) {
        parser.trackToolFields(options.trackToolFields);
        parser.setFieldUpdateCallback((update: PartialFieldUpdate) => {
          fieldUpdateQueue.push(update);
        });
      }

      let fullText = '';
      let lastChunk: ChatCompletionChunk | null = null;
      let usage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
        prompt_tokens_details?: { cached_tokens?: number };
      } | null = null;

      let refusal: string | undefined;
      for await (const chunk of stream) {
        // Store the last chunk
        lastChunk = chunk;

        if (chunk.usage) {
          usage = chunk.usage;
        }

        const choice = chunk.choices?.[0];
        if (choice) {
          const delta = choice.delta;
          if (delta) {
            if (delta.refusal) {
              refusal = delta.refusal;
              break;
            }

            if (delta.content) {
              const textDelta = delta.content;
              fullText += textDelta;

              // Process the chunk (this will populate fieldUpdateQueue)
              for (const { json, index } of parser.processChunk(textDelta)) {
                try {
                  const toolCall = JSON.parse(json) as LlmToolCall;
                  yield {
                    type: 'toolCall' as const,
                    toolCall,
                    index,
                  };
                } catch (error) {
                  console.error('Failed to parse tool call:', error);
                  console.error('JSON:', json);
                }
              }

              // Yield field updates for incomplete tool calls
              while (fieldUpdateQueue.length > 0) {
                const update = fieldUpdateQueue.shift()!;
                yield {
                  type: 'field' as const,
                  index: update.index,
                  toolName: update.toolName,
                  argumentKey: update.argumentKey,
                  value: update.value,
                  delta: update.delta,
                };
              }
            }
          }

          if (choice.finish_reason === 'content_filter' && !refusal) {
            refusal = '';
          }
        }
      }

      if (!lastChunk) {
        throw new LlmApiError(500, 'No response received from stream');
      }

      const responseTime = Date.now() - startTime;

      const result: LlmResponseBase = {
        platform: this.platform,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        temperature,
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        thinkingTokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
        request,
        response: {
          ...lastChunk,
          output_text: fullText,
        },
        responseTime,
      };

      if (refusal !== undefined) {
        if (refusal) {
          refusal = `: ${refusal}`;
        } else {
          refusal = '';
        }
        if (!refusal.endsWith('.')) {
          refusal += '.';
        }
        throw new LlmInvalidContentError(
          `${this.serviceName} refused to generate content${refusal} Try again with a different message.`,
          result
        );
      }

      // Finalize and yield any remaining tool calls
      for (const { json, index } of parser.finalize()) {
        try {
          const toolCall = JSON.parse(json) as LlmToolCall;
          yield {
            type: 'toolCall' as const,
            toolCall,
            index,
          };
        } catch (error) {
          console.error('Failed to parse tool call:', error);
          console.error('JSON:', json);
        }
      }

      if (!fullText) {
        return {
          ...result,
          toolCalls: [],
        };
      }

      try {
        const toolCalls = parseAndFixJson<LlmToolCall[]>(fullText);
        return {
          ...result,
          toolCalls,
        };
      } catch (error) {
        console.error(error);
        console.error(fullText);
        throw new LlmInvalidContentError(
          `${this.serviceName} returned invalid JSON`,
          result
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
