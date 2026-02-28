import { OpenAI } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { ResponseFormatJSONObject, ResponseFormatText } from 'openai/resources';
import {
  Response,
  ResponseCreateParamsBase,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseFormatTextJSONSchemaConfig,
  ResponseInput,
  ResponseOutputText,
} from 'openai/resources/responses/responses';

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
import {
  LlmTool,
  LlmToolCall,
  normalizeToolCall,
  parseToolCallsFromJson,
} from './llm.tool';
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

export class OpenAIService extends LlmService {
  private client: OpenAI;
  protected readonly serviceName: string = 'OpenAI';

  public constructor(options: LlmServiceOptions) {
    super(options);
    this.client = new OpenAI({
      apiKey: this.options.apiKey,
      ...(this.options.baseUrl && { baseURL: this.options.baseUrl }),
    });
  }

  private async createResponsesWithRetry(
    request: ResponseCreateParamsNonStreaming,
    options: { maxTries?: number; retryDelay?: number; verbose?: boolean } = {}
  ): Promise<Response> {
    const maxTries = options.maxTries ?? LlmService.DEFAULT_MAX_TRIES;
    const retryDelay = options.retryDelay ?? LlmService.DEFAULT_RETRY_DELAY;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const response = await this.client.responses.create(request);
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
  ): [string[], ResponseInput] {
    const systemMessages: string[] = [];
    const userAssistantMessages: ResponseInput = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          systemMessages.push(message.content);
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
                      type: 'input_text',
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
                        type: 'input_image',
                        detail: 'auto',
                        image_url: `data:${mediaType};base64,${imageData}`,
                      };
                    } else {
                      return {
                        type: 'input_image',
                        detail: 'auto',
                        image_url: content.image,
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

  private findRefusal(response: Response): string | undefined {
    for (const output of response.output) {
      if (output.type === 'message') {
        for (const content of output.content) {
          if (content.type === 'refusal') {
            return content.refusal;
          }
        }
      }
    }
  }

  private throwIfContentFiltered(
    response: Response,
    result: LlmResponseBase
  ): void {
    if (response.incomplete_details?.reason !== 'content_filter') {
      return;
    }

    let refusal = this.findRefusal(response);
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

  private findAnnotations(
    response: Response
  ):
    | Array<
        | ResponseOutputText.FileCitation
        | ResponseOutputText.URLCitation
        | ResponseOutputText.ContainerFileCitation
        | ResponseOutputText.FilePath
      >
    | undefined {
    for (const output of response.output) {
      if (output.type === 'message') {
        for (const content of output.content) {
          if (content.type === 'output_text') {
            return content.annotations;
          }
        }
      }
    }
  }

  private injectJsonInstruction(messages: LlmMessage[]): LlmMessage[] {
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    const instruction = 'You must respond in valid JSON format.';
    if (lastUserIndex === -1) {
      return [...messages, { role: 'user', content: instruction }];
    }

    const newMessages = [...messages];
    const lastMessage = { ...newMessages[lastUserIndex] };

    if (typeof lastMessage.content === 'string') {
      if (!lastMessage.content.toLowerCase().includes('json')) {
        lastMessage.content = `${lastMessage.content}\n\n${instruction}`;
      }
    } else if (Array.isArray(lastMessage.content)) {
      const hasJson = lastMessage.content.some(
        (c) => c.type === 'text' && c.text.toLowerCase().includes('json')
      );
      if (!hasJson) {
        lastMessage.content = [
          ...lastMessage.content,
          { type: 'text', text: `\n\n${instruction}` },
        ];
      }
    }

    newMessages[lastUserIndex] = lastMessage;
    return newMessages;
  }

  public async generate<T extends boolean = false>(
    messages: LlmMessage[],
    options?: LlmOptions & { jsonOutput?: T }
  ): Promise<LlmGenerateResponse<T>> {
    try {
      if (options?.jsonOutput || options?.jsonSchema) {
        messages = this.injectJsonInstruction(messages);
      }

      // openai does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToOpenAiMessages(messages);

      let responseFormat:
        | ResponseFormatText
        | ResponseFormatTextJSONSchemaConfig
        | ResponseFormatJSONObject;
      if (options?.jsonSchema) {
        responseFormat = zodTextFormat(options.jsonSchema, 'response');
      } else if (options?.jsonOutput) {
        responseFormat = { type: 'json_object' };
      } else {
        responseFormat = { type: 'text' };
      }
      let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let temperature: number | undefined;
      const request: ResponseCreateParamsNonStreaming = {
        model: this.model,
        instructions: systemMessages.join('\n\n'),
        input: userAssistantMessages,
        max_output_tokens: maxOutputTokens,
        text: {
          format: responseFormat,
        },
        store: false,
      };
      if (options?.webSearch) {
        request.tools ??= [];
        request.tools.push({
          type: 'web_search',
        });
      }
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
          request.reasoning ??= {};
          request.reasoning.effort = options.thinkingLevel;
        }
        if (this.supportOutputVerbosity && options?.outputVerbosity) {
          request.text!.verbosity = options.outputVerbosity;
        }
      }
      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.createResponsesWithRetry(request, options);
      const responseTime = Date.now() - startTime;

      const result: LlmResponseBase = {
        platform: this.platform,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        temperature,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        thinkingTokens:
          response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
        cachedInputTokens:
          response.usage?.input_tokens_details?.cached_tokens ?? 0,
        request,
        response,
        responseTime,
      };

      this.throwIfContentFiltered(response, result);

      const responseText = response.output_text;
      if (!responseText) {
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
        const annotations = this.findAnnotations(response);
        if (annotations) {
          for (const annotation of annotations) {
            if (annotation.type === 'url_citation') {
              sources.push({
                url: annotation.url,
                title: annotation.title,
                startIndex: annotation.start_index,
                endIndex: annotation.end_index,
                content: responseText.substring(
                  annotation.start_index,
                  annotation.end_index
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
    systemMessages: string[],
    tools: LlmTool[]
  ): void {
    systemMessages.push(`Available tools:`);

    for (const tool of tools) {
      const parameters = zodSchemaToLlmFriendlyString(tool.parameters);
      systemMessages.push(
        `${tool.name}: ${tool.description}
parameters: ${parameters}`
      );
    }

    systemMessages.push(
      `Output selected tools as JSON only:
{"toolCalls": [{"name": "tool_name", "arguments": {...}}, ...]}`
    );
  }

  private buildToolsRequest(
    systemMessages: string[],
    userAssistantMessages: ResponseInput,
    options?: LlmOptions
  ): {
    request: ResponseCreateParamsBase;
    maxOutputTokens: number;
    temperature: number | undefined;
  } {
    let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
    let temperature: number | undefined;
    const request: ResponseCreateParamsBase = {
      model: this.model,
      instructions: systemMessages.join('\n\n'),
      input: userAssistantMessages,
      max_output_tokens: maxOutputTokens,
      ...(!this.disableResponseFormat && {
        text: {
          format: { type: 'json_object' as const },
        },
      }),
      store: false,
    };
    if (options?.webSearch) {
      request.tools = [
        {
          type: 'web_search' as const,
        },
      ];
    }
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
        request.reasoning = {
          effort: options.thinkingLevel,
        };
      }
      if (this.supportOutputVerbosity && options?.outputVerbosity) {
        (request.text as Record<string, unknown>).verbosity =
          options.outputVerbosity;
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
      messages = this.injectJsonInstruction(messages);

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
      const response = await this.createResponsesWithRetry(
        request as ResponseCreateParamsNonStreaming,
        options
      );
      const responseTime = Date.now() - startTime;

      const result: LlmResponseBase = {
        platform: this.platform,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        temperature,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        thinkingTokens:
          response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
        cachedInputTokens:
          response.usage?.input_tokens_details?.cached_tokens ?? 0,
        request,
        response,
        responseTime,
      };

      this.throwIfContentFiltered(response, result);

      const responseText = response.output_text;
      if (!responseText) {
        return {
          ...result,
          toolCalls: [],
        };
      }

      try {
        return {
          ...result,
          toolCalls: parseToolCallsFromJson(responseText),
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
      messages = this.injectJsonInstruction(messages);

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

      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const stream = await this.client.responses.create(
        request as ResponseCreateParamsStreaming
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

      let response: Response | null = null;

      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'response.output_text.delta': {
            const textDelta = chunk.delta;

            // Process the chunk (this will populate fieldUpdateQueue)
            for (const { json, index } of parser.processChunk(textDelta)) {
              try {
                const toolCall = normalizeToolCall(JSON.parse(json));
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
                ...(update.entityKey && { entityKey: update.entityKey }),
                argumentKey: update.argumentKey,
                value: update.value,
                delta: update.delta,
              };
            }
            break;
          }
          case 'response.completed': {
            response = chunk.response;
            break;
          }
          case 'error': {
            throw new LlmApiError(500, chunk.message);
          }
        }
      }

      if (!response) {
        throw new LlmApiError(500, 'No response received from stream');
      }

      const responseTime = Date.now() - startTime;

      const result: LlmResponseBase = {
        platform: this.platform,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        temperature,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        thinkingTokens:
          response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
        cachedInputTokens:
          response.usage?.input_tokens_details?.cached_tokens ?? 0,
        request,
        response,
        responseTime,
      };

      this.throwIfContentFiltered(response, result);

      // Finalize and yield any remaining tool calls
      for (const { json, index } of parser.finalize()) {
        try {
          const toolCall = normalizeToolCall(JSON.parse(json));
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

      // Parse all tool calls from the complete response
      const responseText = response.output_text;
      let toolCalls: LlmToolCall[] = [];

      if (responseText) {
        try {
          toolCalls = parseToolCallsFromJson(responseText);
        } catch (error) {
          console.error(error);
          console.error(responseText);
          throw new LlmInvalidContentError(
            `${this.serviceName} returned invalid JSON`,
            result
          );
        }
      }

      return {
        ...result,
        toolCalls,
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new LlmApiError(error.status, error.message);
      }
      throw error;
    }
  }
}
