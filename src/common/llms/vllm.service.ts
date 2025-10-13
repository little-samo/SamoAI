import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions';

import { LlmOptions, LlmServiceOptions } from './llm.types';
import { OpenAIChatCompletionService } from './openai.chat-completion-service';

/**
 * vLLM Service - OpenAI compatible API for vLLM inference server
 *
 * vLLM is a high-throughput and memory-efficient inference engine for LLMs.
 * It provides an OpenAI-compatible API, allowing seamless integration.
 *
 * @see https://docs.vllm.ai/en/latest/
 */
export class VLLMService extends OpenAIChatCompletionService {
  protected readonly serviceName: string = 'vLLM';

  public constructor(options: LlmServiceOptions) {
    super({
      ...options,
      disableResponseFormat: true,
    });

    // vLLM requires a baseUrl to be specified for the server endpoint
    if (!this.baseUrl) {
      throw new Error(
        'vLLM service requires a baseUrl to be specified. ' +
          'Please provide the vLLM server endpoint (e.g., http://localhost:8000/v1)'
      );
    }
  }

  protected buildToolsRequest(
    systemMessages: ChatCompletionMessageParam[],
    userAssistantMessages: ChatCompletionMessageParam[],
    options?: LlmOptions
  ): {
    request: ChatCompletionCreateParamsBase;
    maxOutputTokens: number;
    temperature: number | undefined;
  } {
    const { request, maxOutputTokens, temperature } = super.buildToolsRequest(
      systemMessages,
      userAssistantMessages,
      options
    );

    // @ts-expect-error - vLLM uses guided_json instead of response_format
    request.extra_body = {
      guided_json: {
        type: 'object',
        properties: {
          toolCalls: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                },
                arguments: {
                  type: 'object',
                },
              },
              required: ['name', 'arguments'],
            },
          },
        },
        required: ['toolCalls'],
      },
    };

    return { request, maxOutputTokens, temperature };
  }
}
