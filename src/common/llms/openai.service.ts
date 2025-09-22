import { OpenAI } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { ResponseFormatJSONObject, ResponseFormatText } from 'openai/resources';
import {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseFormatTextJSONSchemaConfig,
  ResponseInput,
  ResponseOutputText,
} from 'openai/resources/responses/responses';

import { sleep, zodSchemaToLlmFriendlyString, parseAndFixJson } from '../utils';

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

      if (response.incomplete_details?.reason === 'content_filter') {
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
          `${this.serviceName} refused to generate content${refusal} Try again with a different request.`,
          result
        );
      }

      const responseText = response.output_text;
      if (!responseText) {
        throw new LlmInvalidContentError(
          `${this.serviceName} returned no content. Try again with a different request.`,
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

      systemMessages.push(
        `The definition of the tools you have can be organized as a JSON Schema as follows. Clearly understand the definition and purpose of each tool.`
      );

      for (const tool of tools) {
        const parameters = zodSchemaToLlmFriendlyString(tool.parameters);
        systemMessages.push(
          `name: ${tool.name}
description: ${tool.description}
parameters: ${parameters}`
        );
      }

      systemMessages.push(
        `Refer to the definitions of the available tools above, and output the tools you plan to use in JSON format. Based on that analysis, select and use the necessary tools from the rest—following the guidance provided in the previous prompt.

Response can only be in JSON format and must strictly follow the following format, with no surrounding text or markdown:
[
  {
    "name": "tool_name",
    "arguments": { ... }
  },
  ... // (Include additional tool calls as needed)
]`
      );

      let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let temperature: number | undefined;
      const request: ResponseCreateParamsNonStreaming = {
        model: this.model,
        instructions: systemMessages.join('\n\n'),
        input: userAssistantMessages,
        max_output_tokens: maxOutputTokens,
        text: {
          format: { type: 'text' },
        },
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
      if (this.thinking) {
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

      if (response.incomplete_details?.reason === 'content_filter') {
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
          `${this.serviceName} refused to generate content${refusal} Try again with a different request.`,
          result
        );
      }

      const responseText = response.output_text;
      if (!responseText) {
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
}
