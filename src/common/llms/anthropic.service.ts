import { Anthropic, AnthropicError, APIError } from '@anthropic-ai/sdk';
import {
  Message,
  MessageCreateParams,
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  MessageParam,
  StopReason,
  TextBlock,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';

import {
  sleep,
  zodSchemaToLlmFriendlyString,
  parseAndFixJson,
  JsonArrayStreamParser,
  PartialFieldUpdate,
} from '../utils';

import { LlmApiError, LlmInvalidContentError } from './llm.errors';
import { LlmService } from './llm.service';
import { LlmTool, normalizeToolCall, parseToolCallsFromJson } from './llm.tool';
import {
  LlmServiceOptions,
  LlmMessage,
  LlmOptions,
  LlmGenerateResponse,
  LlmToolsResponse,
  LlmPlatform,
  LlmResponseBase,
  LlmToolsStreamEvent,
} from './llm.types';

export class AnthropicService extends LlmService {
  private client: Anthropic;

  public constructor(options: LlmServiceOptions) {
    super(options);
    this.client = new Anthropic({
      apiKey: this.options.apiKey,
      ...(this.options.baseUrl && { baseURL: this.options.baseUrl }),
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
                    } else {
                      return {
                        type: 'image',
                        source: {
                          type: 'url',
                          url: content.image,
                        },
                      };
                    }
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
        if (response.stop_reason === 'refusal') {
          throw new LlmInvalidContentError(
            'Anthropic refused to generate content. Try again with a different message.',
            result
          );
        }
        throw new LlmInvalidContentError(
          'Anthropic returned no content. Try again with a different message.',
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

  private prepareToolsSystemMessages(
    systemMessages: TextBlockParam[],
    tools: LlmTool[]
  ): void {
    systemMessages.push({
      type: 'text',
      text: `Available tools:`,
    });

    for (const tool of tools) {
      const parameters = zodSchemaToLlmFriendlyString(tool.parameters);
      systemMessages.push({
        type: 'text',
        text: `${tool.name}: ${tool.description}
parameters: ${parameters}`,
      });
    }

    systemMessages.push({
      type: 'text',
      text: `Output selected tools as JSON only:
{"toolCalls": [{"name": "tool_name", "arguments": {...}}, ...]}`,
    });

    systemMessages[systemMessages.length - 1].cache_control = {
      type: 'ephemeral',
    };
  }

  private buildToolsRequest(
    systemMessages: TextBlockParam[],
    userAssistantMessages: MessageParam[],
    options?: LlmOptions
  ): {
    request: MessageCreateParams;
    maxOutputTokens: number;
    thinkingBudget: number | undefined;
    temperature: number | undefined;
  } {
    let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
    let thinkingBudget: number | undefined;
    let temperature: number | undefined;
    const request: MessageCreateParams = {
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
        type: 'enabled' as const,
        budget_tokens: thinkingBudget,
      };
      request.max_tokens = maxOutputTokens;
    } else {
      temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
      request.temperature = temperature;
    }
    return { request, maxOutputTokens, thinkingBudget, temperature };
  }

  public override async useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolsResponse> {
    try {
      messages = this.injectJsonInstruction(messages);
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToAnthropicMessages(messages);

      this.prepareToolsSystemMessages(systemMessages, tools);

      const { request, maxOutputTokens, thinkingBudget, temperature } =
        this.buildToolsRequest(systemMessages, userAssistantMessages, options);

      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.createMessageWithRetry(
        request as MessageCreateParamsNonStreaming,
        options
      );
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
        if (response.stop_reason === 'refusal') {
          throw new LlmInvalidContentError(
            'Anthropic refused to generate content. Try again with a different message.',
            result
          );
        }
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

  public async *useToolsStream(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): AsyncGenerator<LlmToolsStreamEvent, LlmToolsResponse> {
    try {
      messages = this.injectJsonInstruction(messages);
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToAnthropicMessages(messages);

      this.prepareToolsSystemMessages(systemMessages, tools);

      const { request, maxOutputTokens, thinkingBudget, temperature } =
        this.buildToolsRequest(systemMessages, userAssistantMessages, options);
      request.stream = true;

      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const stream = await this.client.messages.create(
        request as MessageCreateParamsStreaming
      );

      const parser = new JsonArrayStreamParser();
      const fieldUpdateQueue: PartialFieldUpdate[] = [];

      if (options?.trackToolFields && options.trackToolFields.length > 0) {
        parser.trackToolFields(options.trackToolFields);
        parser.setFieldUpdateCallback((update: PartialFieldUpdate) => {
          fieldUpdateQueue.push(update);
        });
      }

      let fullText = '';
      let stopReason: StopReason | null = null;
      let usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      } = {
        input_tokens: 0,
        output_tokens: 0,
      };

      for await (const event of stream) {
        switch (event.type) {
          case 'message_start':
            usage = event.message.usage;
            break;
          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              const textDelta = event.delta.text;
              fullText += textDelta;

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
            }
            break;
          case 'message_delta':
            if (event.delta.stop_reason) {
              stopReason = event.delta.stop_reason;
            }
            usage.input_tokens = event.usage.input_tokens ?? usage.input_tokens;
            usage.output_tokens = event.usage.output_tokens;
            usage.cache_read_input_tokens =
              event.usage.cache_read_input_tokens ??
              usage.cache_read_input_tokens;
            usage.cache_creation_input_tokens =
              event.usage.cache_creation_input_tokens ??
              usage.cache_creation_input_tokens;
            break;
          case 'message_stop':
            // Stream complete
            break;
        }
      }

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

      const responseTime = Date.now() - startTime;

      // Create a synthetic message object for the result
      const result: LlmResponseBase = {
        platform: LlmPlatform.ANTHROPIC,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        thinkingBudget,
        temperature,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cachedInputTokens:
          usage.cache_read_input_tokens === null
            ? undefined
            : usage.cache_read_input_tokens,
        cacheCreationTokens:
          usage.cache_creation_input_tokens === null
            ? undefined
            : usage.cache_creation_input_tokens,
        request,
        response: {
          stop_reason: stopReason,
          text: fullText,
        },
        responseTime,
      };

      if (!fullText) {
        if (stopReason === 'refusal') {
          throw new LlmInvalidContentError(
            'Anthropic refused to generate content. Try again with a different message.',
            result
          );
        }
        return {
          ...result,
          toolCalls: [],
        };
      }

      try {
        return {
          ...result,
          toolCalls: parseToolCallsFromJson(fullText),
        };
      } catch (error) {
        console.error(error);
        console.error(fullText);
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
