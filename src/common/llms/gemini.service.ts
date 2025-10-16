import {
  Content,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';

import {
  sleep,
  zodSchemaToLlmFriendlyString,
  parseAndFixJson,
  getImageBase64,
  JsonArrayStreamParser,
  PartialFieldUpdate,
} from '../utils';

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
  LlmGenerateResponseWebSearchSource,
  LlmResponseType,
  LlmToolsStreamEvent,
} from './llm.types';

export class GeminiService extends LlmService {
  private client: GoogleGenAI;

  public constructor(options: LlmServiceOptions) {
    super(options);
    this.client = new GoogleGenAI({
      apiKey: this.options.apiKey,
      ...(this.options.baseUrl && { baseURL: this.options.baseUrl }),
      ...(this.options.geminiVertexai && {
        vertexai: true,
        project: this.options.geminiVertexaiProject,
        location: this.options.geminiVertexaiLocation,
      }),
    });
  }

  private async generateContentWithRetry(
    request: GenerateContentParameters,
    options: {
      maxTries?: number;
      retryDelay?: number;
      verbose?: boolean;
    } = {}
  ): Promise<GenerateContentResponse> {
    const maxTries = options.maxTries ?? LlmService.DEFAULT_MAX_TRIES;
    const retryDelay = options.retryDelay ?? LlmService.DEFAULT_RETRY_DELAY;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const response = await this.client.models.generateContent(request);
        if (options.verbose) {
          console.log(JSON.stringify(response, null, 2));
          console.log(
            `Gemini time taken: ${((Date.now() - startTime) / 1000).toFixed(2)}s`
          );
        }
        return response;
      } catch (error) {
        console.error(error);
        if (
          attempt < maxTries &&
          error instanceof Error &&
          (error.name === 'ServerError' || error.name === 'ClientError') &&
          !error.message.includes('400 Bad Request')
        ) {
          await sleep(attempt * retryDelay);
          continue;
        }
        throw error;
      }
    }
    throw new LlmApiError(500, 'Max retry attempts reached');
  }

  private async llmMessagesToGeminiMessages(
    messages: LlmMessage[]
  ): Promise<[Content, Content[]]> {
    const systemMessages: Content = { parts: [] };
    const userAssistantMessages: Content[] = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          systemMessages.parts!.push({
            text: message.content,
          });
          break;
        case 'assistant':
          userAssistantMessages.push({
            role: 'model',
            parts: [{ text: message.content }],
          });
          break;
        case 'user':
          if (Array.isArray(message.content)) {
            const parts = await Promise.all(
              message.content.map(async (content) => {
                switch (content.type) {
                  case 'text':
                    return {
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
                        mediaType = matches[1] as
                          | 'image/png'
                          | 'image/jpeg'
                          | 'image/gif'
                          | 'image/webp';
                        imageData = matches[2];
                      }

                      return {
                        inlineData: {
                          data: imageData,
                          mimeType: mediaType,
                        },
                      };
                    } else {
                      // URL image - use cache to get base64
                      const imageEntry = await getImageBase64(content.image);
                      return {
                        inlineData: {
                          data: imageEntry.base64,
                          mimeType: imageEntry.mimeType,
                        },
                      };
                    }
                }
              })
            );
            userAssistantMessages.push({
              role: message.role,
              parts,
            });
          } else {
            userAssistantMessages.push({
              role: message.role,
              parts: [{ text: message.content }],
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
    // gemini does not support assistant message prefilling
    messages = messages.filter((message) => message.role !== 'assistant');

    const [systemMessages, userAssistantMessages] =
      await this.llmMessagesToGeminiMessages(messages);

    let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
    let thinkingBudget: number | undefined;
    const temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
    const request: GenerateContentParameters = {
      model: this.model,
      contents: userAssistantMessages,
      config: {
        temperature,
        maxOutputTokens,
        systemInstruction: systemMessages,
      },
    };
    if (this.thinking) {
      thinkingBudget =
        options?.maxThinkingTokens ?? LlmService.DEFAULT_MAX_THINKING_TOKENS;
      maxOutputTokens += thinkingBudget;
      request.config!.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget,
      };
      request.config!.maxOutputTokens = maxOutputTokens;
    } else {
      if (this.model.includes('image')) {
        // image generation models do not support thinking budget
      } else {
        request.config!.thinkingConfig = {
          thinkingBudget: 0,
        };
      }
    }
    if (options?.webSearch) {
      request.config!.tools = [
        {
          googleSearch: {},
        },
      ];
    }
    if (options?.responseTypes) {
      const responseModalities: string[] = [];
      if (options.responseTypes.includes(LlmResponseType.text)) {
        responseModalities.push('TEXT');
      }
      if (options.responseTypes.includes(LlmResponseType.image)) {
        responseModalities.push('IMAGE');
      }
      if (options.responseTypes.includes(LlmResponseType.audio)) {
        responseModalities.push('AUDIO');
      }
      request.config!.responseModalities = responseModalities;
    }
    if (options?.jsonOutput && !options?.webSearch) {
      request.config!.responseMimeType = 'application/json';
    }
    if (options?.verbose) {
      console.log(request);
    }

    const startTime = Date.now();
    const response = await this.generateContentWithRetry(request, options);
    const responseTime = Date.now() - startTime;

    let responseText: string | undefined;
    const imageData = response.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData
    )?.inlineData;
    if (imageData) {
      responseText = `data:${imageData.mimeType};base64,${imageData.data}`;
    } else {
      responseText = response.text;
    }

    let inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    inputTokens += response.usageMetadata?.toolUsePromptTokenCount ?? 0;

    let outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const thinkingTokens =
      response.usageMetadata?.thoughtsTokenCount ?? undefined;
    if (thinkingTokens) {
      outputTokens += thinkingTokens;
    }

    const cachedInputTokens =
      response.usageMetadata?.cachedContentTokenCount ?? undefined;

    const result: LlmResponseBase = {
      platform: LlmPlatform.GEMINI,
      model: this.model,
      thinking: this.thinking,
      maxOutputTokens,
      thinkingBudget,
      temperature,
      inputTokens,
      outputTokens,
      thinkingTokens,
      cachedInputTokens,
      request,
      response,
      responseTime,
    };

    if (!responseText) {
      if (response.promptFeedback?.blockReasonMessage) {
        let blockReasonMessage = response.promptFeedback.blockReasonMessage;
        if (!blockReasonMessage.endsWith('.')) {
          blockReasonMessage += '.';
        }
        throw new LlmInvalidContentError(
          `Gemini refused to generate content: ${blockReasonMessage} Try again with a different message.`,
          result
        );
      }
      if (
        response.promptFeedback?.blockReason ||
        response.candidates?.[0]?.finishReason === 'PROHIBITED_CONTENT'
      ) {
        throw new LlmInvalidContentError(
          'Gemini refused to generate content. Try again with a different message.',
          result
        );
      }
      throw new LlmInvalidContentError(
        'Gemini returned no content. Try again with a different message.',
        result
      );
    }

    if (options?.jsonOutput) {
      try {
        const content = parseAndFixJson(responseText);
        return {
          ...result,
          content: content as T extends true ? Record<string, unknown> : string,
        };
      } catch (error) {
        console.error(error);
        console.error(responseText);
        throw new LlmInvalidContentError(
          'Gemini returned invalid JSON',
          result
        );
      }
    }

    let sources: LlmGenerateResponseWebSearchSource[] | undefined;
    if (options?.webSearch && response.candidates?.[0]?.groundingMetadata) {
      const groundingMetadata = response.candidates[0].groundingMetadata;
      if (
        groundingMetadata.groundingChunks &&
        groundingMetadata.groundingSupports
      ) {
        sources = [];
        for (const groundingSupport of groundingMetadata.groundingSupports) {
          const segment = groundingSupport.segment;
          if (!groundingSupport.groundingChunkIndices || !segment) {
            continue;
          }
          for (const groundingChunkIndex of groundingSupport.groundingChunkIndices) {
            const groundingChunk =
              groundingMetadata.groundingChunks[groundingChunkIndex];
            if (!groundingChunk.web) {
              continue;
            }
            if (
              !groundingChunk.web.uri ||
              !groundingChunk.web.title ||
              !segment.startIndex ||
              !segment.endIndex ||
              !segment.text
            ) {
              continue;
            }
            sources.push({
              url: groundingChunk.web.uri,
              title: groundingChunk.web.title,
              startIndex: segment.startIndex,
              endIndex: segment.endIndex,
              content: segment.text,
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
  }

  private prepareToolsSystemMessages(
    systemMessages: Content,
    tools: LlmTool[]
  ): void {
    systemMessages.parts!.push({
      text: `The definition of the tools you have can be organized as a JSON Schema as follows. Clearly understand the definition and purpose of each tool.`,
    });

    for (const tool of tools) {
      const parameters = zodSchemaToLlmFriendlyString(tool.parameters);
      systemMessages.parts!.push({
        text: `name: ${tool.name}
description: ${tool.description}
parameters: ${parameters}`,
      });
    }

    systemMessages.parts!.push({
      text: `Refer to the definitions of the available tools above, and output the tools you plan to use in JSON format. Based on that analysis, select and use the necessary tools from the rest—following the guidance provided in the previous prompt.

Response can only be in JSON format and must strictly follow the following format, with no surrounding text or markdown:
{
  "toolCalls": [
    {
      "name": "tool_name",
      "arguments": { ... }
    }
    ... // (Include additional tool calls as needed)
  ]
}`,
    });
  }

  private buildToolsRequest(
    systemMessages: Content,
    userAssistantMessages: Content[],
    options?: LlmOptions
  ): {
    request: GenerateContentParameters;
    maxOutputTokens: number;
    thinkingBudget: number | undefined;
    temperature: number;
  } {
    let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
    let thinkingBudget: number | undefined;
    const temperature = options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
    const request: GenerateContentParameters = {
      model: this.model,
      contents: userAssistantMessages,
      config: {
        temperature,
        maxOutputTokens,
        systemInstruction: systemMessages,
      },
    };
    if (this.thinking) {
      thinkingBudget =
        options?.maxThinkingTokens ?? LlmService.DEFAULT_MAX_THINKING_TOKENS;
      maxOutputTokens += thinkingBudget;
      request.config!.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget,
      };
      request.config!.maxOutputTokens = maxOutputTokens;
    } else {
      if (this.model.includes('image')) {
        // image generation models do not support thinking budget
      } else {
        request.config!.thinkingConfig = {
          thinkingBudget: 0,
        };
      }
    }
    if (options?.webSearch) {
      request.config!.tools = [
        {
          googleSearch: {},
        },
      ];
    } else {
      request.config!.responseMimeType = 'application/json';
    }
    return { request, maxOutputTokens, thinkingBudget, temperature };
  }

  public async useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolsResponse> {
    // gemini does not support assistant message prefilling
    messages = messages.filter((message) => message.role !== 'assistant');

    const [systemMessages, userAssistantMessages] =
      await this.llmMessagesToGeminiMessages(messages);

    this.prepareToolsSystemMessages(systemMessages, tools);

    const { request, maxOutputTokens, thinkingBudget, temperature } =
      this.buildToolsRequest(systemMessages, userAssistantMessages, options);

    if (options?.verbose) {
      console.log(request);
    }

    const startTime = Date.now();
    const response = await this.generateContentWithRetry(request, options);
    const responseTime = Date.now() - startTime;

    let inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    inputTokens += response.usageMetadata?.toolUsePromptTokenCount ?? 0;

    const responseText = response.text;
    let outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const thinkingTokens =
      response.usageMetadata?.thoughtsTokenCount ?? undefined;

    if (thinkingTokens) {
      outputTokens += thinkingTokens;
    }

    const cachedInputTokens =
      response.usageMetadata?.cachedContentTokenCount ?? undefined;

    const result: LlmResponseBase = {
      platform: LlmPlatform.GEMINI,
      model: this.model,
      thinking: this.thinking,
      maxOutputTokens,
      thinkingBudget,
      temperature,
      inputTokens,
      outputTokens,
      thinkingTokens,
      cachedInputTokens,
      request,
      response,
      responseTime,
    };
    if (!responseText) {
      if (response.promptFeedback?.blockReasonMessage) {
        let blockReasonMessage = response.promptFeedback.blockReasonMessage;
        if (!blockReasonMessage.endsWith('.')) {
          blockReasonMessage += '.';
        }
        throw new LlmInvalidContentError(
          `Gemini refused to generate content: ${blockReasonMessage} Try again with a different message.`,
          result
        );
      }
      if (
        response.promptFeedback?.blockReason ||
        response.candidates?.[0]?.finishReason === 'PROHIBITED_CONTENT'
      ) {
        throw new LlmInvalidContentError(
          'Gemini refused to generate content. Try again with a different message.',
          result
        );
      }
      return {
        ...result,
        toolCalls: [],
      };
    }
    try {
      const parsed = parseAndFixJson<{ toolCalls: LlmToolCall[] }>(
        responseText
      );
      return {
        ...result,
        toolCalls: parsed.toolCalls,
      };
    } catch (error) {
      console.error(error);
      console.error(responseText);
      throw new LlmInvalidContentError('Gemini returned invalid JSON', result);
    }
  }

  public async *useToolsStream(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): AsyncGenerator<LlmToolsStreamEvent, LlmToolsResponse> {
    // gemini does not support assistant message prefilling
    messages = messages.filter((message) => message.role !== 'assistant');

    const [systemMessages, userAssistantMessages] =
      await this.llmMessagesToGeminiMessages(messages);

    this.prepareToolsSystemMessages(systemMessages, tools);

    const { request, maxOutputTokens, thinkingBudget, temperature } =
      this.buildToolsRequest(systemMessages, userAssistantMessages, options);

    if (options?.verbose) {
      console.log(request);
    }

    const startTime = Date.now();
    const stream = await this.client.models.generateContentStream(request);

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
    let lastChunk: GenerateContentResponse | null = null;

    for await (const chunk of stream) {
      const textChunk = chunk.text;
      if (textChunk) {
        fullText += textChunk;

        // Process the chunk (this will populate fieldUpdateQueue)
        for (const { json, index } of parser.processChunk(textChunk)) {
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

      // Store the last chunk as the full response
      lastChunk = chunk;
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

    const responseTime = Date.now() - startTime;

    if (!lastChunk) {
      throw new LlmApiError(500, 'No response received from stream');
    }

    let inputTokens = lastChunk.usageMetadata?.promptTokenCount ?? 0;
    inputTokens += lastChunk.usageMetadata?.toolUsePromptTokenCount ?? 0;

    let outputTokens = lastChunk.usageMetadata?.candidatesTokenCount ?? 0;
    const thinkingTokens =
      lastChunk.usageMetadata?.thoughtsTokenCount ?? undefined;

    if (thinkingTokens) {
      outputTokens += thinkingTokens;
    }

    const cachedInputTokens =
      lastChunk.usageMetadata?.cachedContentTokenCount ?? undefined;

    const result: LlmResponseBase = {
      platform: LlmPlatform.GEMINI,
      model: this.model,
      thinking: this.thinking,
      maxOutputTokens,
      thinkingBudget,
      temperature,
      inputTokens,
      outputTokens,
      thinkingTokens,
      cachedInputTokens,
      request,
      response: {
        ...lastChunk,
        text: fullText,
      },
      responseTime,
    };

    if (!fullText) {
      if (lastChunk.promptFeedback?.blockReasonMessage) {
        let blockReasonMessage = lastChunk.promptFeedback.blockReasonMessage;
        if (!blockReasonMessage.endsWith('.')) {
          blockReasonMessage += '.';
        }
        throw new LlmInvalidContentError(
          `Gemini refused to generate content: ${blockReasonMessage} Try again with a different message.`,
          result
        );
      }
      if (
        lastChunk.promptFeedback?.blockReason ||
        lastChunk.candidates?.[0]?.finishReason === 'PROHIBITED_CONTENT'
      ) {
        throw new LlmInvalidContentError(
          'Gemini refused to generate content. Try again with a different message.',
          result
        );
      }
      return {
        ...result,
        toolCalls: [],
      };
    }

    try {
      const parsed = parseAndFixJson<{ toolCalls: LlmToolCall[] }>(fullText);
      return {
        ...result,
        toolCalls: parsed.toolCalls,
      };
    } catch (error) {
      console.error(error);
      console.error(fullText);
      throw new LlmInvalidContentError('Gemini returned invalid JSON', result);
    }
  }
}
