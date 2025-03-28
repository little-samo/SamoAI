import zodToJsonSchema from 'zod-to-json-schema';
import {
  Content,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';

import { sleep } from '../utils';

import { LlmMessage, LlmOptions, LlmService } from './llm.service';
import { LlmApiError, LlmInvalidContentError } from './llm.errors';
import { LlmToolCall } from './llm.tool';
import { LlmTool } from './llm.tool';

export class GeminiService extends LlmService {
  private client: GoogleGenAI;

  public constructor(
    public readonly model: string,
    protected readonly apiKey: string,
    options?: {
      reasoning?: boolean;
    }
  ) {
    super(model, apiKey, options);
    this.client = new GoogleGenAI({
      apiKey: apiKey,
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
                    return {
                      inlineData: {
                        data: content.image,
                        mimeType: 'image/png',
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

  public async generate(
    messages: LlmMessage[],
    options?: LlmOptions
  ): Promise<string> {
    try {
      // gemini does not support assistant message prefilling
      messages = messages.filter((message) => message.role !== 'assistant');

      const [systemMessages, userAssistantMessages] =
        this.llmMessagesToGeminiMessages(messages);

      const request: GenerateContentParameters = {
        model: this.model,
        contents: userAssistantMessages,
        config: {
          temperature: options?.temperature ?? LlmService.DEFAULT_TEMPERATURE,
          maxOutputTokens:
            (this.reasoning ? 1024 : 0) + // pad for reasoning
            (options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS),
          systemInstruction: systemMessages,
        },
      };
      if (options?.verbose) {
        console.log(request);
      }

      const response = await this.generateContentWithRetry(request, options);

      if (!response.text) {
        throw new LlmInvalidContentError('Gemini returned no content');
      }

      return response.text;
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
        const parameters = zodToJsonSchema(tool.parameters, {
          target: 'openAi',
        });
        delete parameters['$schema'];
        systemMessages.parts!.push({
          text: `name: ${tool.name}
description: ${tool.description}
parameters: ${JSON.stringify(parameters)}`,
        });
      }

      systemMessages.parts!.push({
        text: `Refer to the definitions of the available tools above, and output the tools you plan to use in JSON format. Begin by using the reasoning tool to perform a chain-of-thought analysis. Based on that analysis, select and use the necessary tools from the rest—following the guidance provided in the previous prompt.

Response can only be in JSON format and must strictly follow the following format, with no surrounding text or markdown:
[
  {
    "name": "tool_name",
    "arguments": { ... }
  },
  ... // (Include additional tool calls as needed)
]`,
      });

      const request: GenerateContentParameters = {
        model: this.model,
        contents: userAssistantMessages,
        config: {
          temperature: options?.temperature ?? LlmService.DEFAULT_TEMPERATURE,
          maxOutputTokens:
            (this.reasoning ? 1024 : 0) + // pad for reasoning
            (options?.maxTokens ?? LlmService.DEFAULT_MAX_TOKENS),
          responseMimeType: 'application/json',
          systemInstruction: systemMessages,
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
