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
import { LlmServiceOptions, LlmMessage, LlmOptions } from './llm.types';

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
  ): Promise<T extends true ? Record<string, unknown> : string> {
    try {
      // gemini does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToGeminiMessages(messages);

      const reasoningMaxTokens = this.reasoning
        ? (options?.maxReasoningTokens ??
          LlmService.DEFAULT_MAX_REASONING_TOKENS)
        : 0;
      const request: GenerateContentParameters = {
        model: this.model,
        contents: userAssistantMessages,
        config: {
          temperature: options?.temperature ?? LlmService.DEFAULT_TEMPERATURE,
          maxOutputTokens:
            (this.reasoning ? reasoningMaxTokens : 0) +
            (options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS),
          systemInstruction: systemMessages,
          thinkingConfig: this.reasoning
            ? {
                includeThoughts: true,
                thinkingBudget: reasoningMaxTokens,
              }
            : undefined,
          tools: options?.webSearch
            ? [
                {
                  googleSearch: {},
                },
              ]
            : undefined,
        },
      };
      if (options?.jsonOutput && !options?.webSearch) {
        request.config!.responseMimeType = 'application/json';
      }
      if (options?.verbose) {
        console.log(request);
      }

      const response = await this.generateContentWithRetry(request, options);

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
          return JSON.parse(responseText) as T extends true
            ? Record<string, unknown>
            : string;
        } catch (error) {
          console.error(error);
          console.error(responseText);
          throw new LlmInvalidContentError('Gemini returned invalid JSON');
        }
      }
      return responseText as T extends true ? Record<string, unknown> : string;
    } catch (error) {
      throw error;
    }
  }

  public async useTools(
    messages: LlmMessage[],
    tools: LlmTool[],
    options?: LlmOptions
  ): Promise<LlmToolCall[]> {
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

      const reasoningMaxTokens = this.reasoning
        ? (options?.maxReasoningTokens ??
          LlmService.DEFAULT_MAX_REASONING_TOKENS)
        : 0;
      const request: GenerateContentParameters = {
        model: this.model,
        contents: userAssistantMessages,
        config: {
          temperature: options?.temperature ?? LlmService.DEFAULT_TEMPERATURE,
          maxOutputTokens:
            reasoningMaxTokens +
            (options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS),
          responseMimeType: 'application/json',
          systemInstruction: systemMessages,
          thinkingConfig: this.reasoning
            ? {
                includeThoughts: true,
                thinkingBudget: reasoningMaxTokens,
              }
            : undefined,
        },
      };
      if (options?.verbose) {
        console.log(request);
      }

      const response = await this.generateContentWithRetry(request, options);

      if (!response.text) {
        throw new LlmInvalidContentError('Gemini returned no content');
      }

      try {
        const toolCalls = JSON.parse(response.text) as LlmToolCall[];
        return toolCalls;
      } catch (error) {
        console.error(error);
        console.error(response.text);
        return [];
      }
    } catch (error) {
      throw error;
    }
  }
}
