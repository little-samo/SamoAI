import {
  Content,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';

import { sleep, zodSchemaToLlmFriendlyString } from '../utils';

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
} from './llm.types';

export class GeminiService extends LlmService {
  private client: GoogleGenAI;

  public constructor(options: LlmServiceOptions) {
    super(options);
    this.client = new GoogleGenAI({
      apiKey: this.apiKey,
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

  private llmMessagesToGeminiMessages(
    messages: LlmMessage[]
  ): [Content, Content[]] {
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
            userAssistantMessages.push({
              role: message.role,
              parts: message.content.map((content) => {
                switch (content.type) {
                  case 'text':
                    return {
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
                      inlineData: {
                        data: imageData,
                        mimeType: mediaType,
                      },
                    };
                }
              }),
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
    try {
      // gemini does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToGeminiMessages(messages);

      let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let thinkingBudget: number | undefined;
      const temperature =
        options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
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
      }
      if (options?.webSearch) {
        request.config!.tools = [
          {
            googleSearch: {},
          },
        ];
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

      if (!response.text) {
        throw new LlmInvalidContentError('Gemini returned no content');
      }

      let responseText = response.text;
      if (options?.jsonOutput) {
        try {
          // Remove potential markdown fences
          if (responseText.startsWith('```json')) {
            responseText = responseText.slice(7);
          } else if (responseText.startsWith('```')) {
            responseText = responseText.slice(3);
          }
          if (responseText.endsWith('```')) {
            responseText = responseText.slice(0, -3);
          }
          return {
            content: JSON.parse(responseText) as T extends true
              ? Record<string, unknown>
              : string,
            platform: LlmPlatform.GEMINI,
            model: this.model,
            thinking: this.thinking,
            maxOutputTokens,
            thinkingBudget,
            temperature,
            inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
            thinkingTokens: response.usageMetadata?.thoughtsTokenCount,
            responseTime,
          };
        } catch (error) {
          console.error(error);
          console.error(responseText);
          throw new LlmInvalidContentError('Gemini returned invalid JSON');
        }
      }
      return {
        content: responseText as T extends true
          ? Record<string, unknown>
          : string,
        platform: LlmPlatform.GEMINI,
        model: this.model,
        thinking: this.thinking,
        maxOutputTokens,
        thinkingBudget,
        temperature,
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        thinkingTokens: response.usageMetadata?.thoughtsTokenCount,
        responseTime,
      };
    } catch (error) {
      throw error;
    }
  }

  public async useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolsResponse> {
    try {
      // gemini does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToGeminiMessages(messages);

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
[
  {
    "name": "tool_name",
    "arguments": { ... }
  },
  ... // (Include additional tool calls as needed)
]`,
      });

      let maxOutputTokens = options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS;
      let thinkingBudget: number | undefined;
      const temperature =
        options?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
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
      if (options?.verbose) {
        console.log(request);
      }

      const startTime = Date.now();
      const response = await this.generateContentWithRetry(request, options);
      const responseTime = Date.now() - startTime;

      if (!response.text) {
        throw new LlmInvalidContentError('Gemini returned no content');
      }

      let responseText = response.text;
      try {
        // Remove potential markdown fences
        if (responseText.startsWith('```json')) {
          responseText = responseText.slice(7);
        } else if (responseText.startsWith('```')) {
          responseText = responseText.slice(3);
        }
        if (responseText.endsWith('```')) {
          responseText = responseText.slice(0, -3);
        }
        const toolCalls = JSON.parse(response.text) as LlmToolCall[];
        return {
          platform: LlmPlatform.GEMINI,
          toolCalls,
          model: this.model,
          thinking: this.thinking,
          maxOutputTokens,
          thinkingBudget,
          temperature,
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          thinkingTokens: response.usageMetadata?.thoughtsTokenCount,
          responseTime,
        };
      } catch (error) {
        console.error(error);
        console.error(response.text);
        throw new LlmInvalidContentError('Gemini returned invalid JSON');
      }
    } catch (error) {
      throw error;
    }
  }
}
