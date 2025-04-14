import {
  ENV,
  LlmFactory,
  LlmMessage,
  LlmPlatform,
  LlmService,
  LlmServiceOptions,
} from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { type LocationEntityCanvasMeta } from '../../../locations/location.meta';
import { type Entity } from '../../entity';
import { GimmickParameters } from '../gimmick.types';

import { GimmickCore } from './gimmick.core';
import { RegisterGimmickCore } from './gimmick.core-decorator';

@RegisterGimmickCore('web_search')
export class GimmickWebSearchCore extends GimmickCore {
  public static readonly DEFAULT_LLM_PLATFORM = LlmPlatform.OPENAI;
  public static readonly DEFAULT_LLM_MODEL = 'gpt-4o-search-preview-2025-03-11';
  public static readonly LLM_MAX_TOKENS = 2048;
  public static readonly DEFAULT_MAX_SEARCH_RESULT_LENGTH = 2000;

  public override get description(): string {
    return 'Performs a web search using an LLM and displays the results.';
  }

  public override get parameters(): z.ZodSchema {
    return z.string().describe('The specific search query for the web search.');
  }

  public override get canvas(): LocationEntityCanvasMeta {
    return {
      name: 'web_search',
      description: 'Displays the detailed results of the web search.',
      maxLength: GimmickWebSearchCore.DEFAULT_MAX_SEARCH_RESULT_LENGTH,
    };
  }

  private async searchWeb(
    entity: Entity,
    llm: LlmService,
    query: string
  ): Promise<void> {
    const maxResultLength = Number(
      this.meta.options?.maxResultLength ??
        GimmickWebSearchCore.DEFAULT_MAX_SEARCH_RESULT_LENGTH
    );
    const maxSummaryLength = this.gimmick.location.meta.messageLengthLimit - 50;

    const messages: LlmMessage[] = [];
    messages.push({
      role: 'system',
      content: `
You are an AI assistant specialized in web searching. Your task is to find the most recent, reliable, and accurate information available on the web to answer the user's query.
Provide the response **ONLY** in plain JSON format with two fields: "result" and "summary". Do not include any other text or formatting outside the JSON structure.
- The "result" field should contain the detailed findings from your search. Limit its length to ${maxResultLength} characters.
- The "summary" field should provide a concise overview of the findings. Limit its length to ${maxSummaryLength} characters.
Ensure the information is up-to-date and factually correct. Focus on providing the best possible answer based on your search results.
The response MUST be a single JSON object string, without any markdown formatting like \`\`\`json.
`.trim(),
    });
    messages.push({
      role: 'user',
      content: query,
    });
    const responseJson = await llm.generate(messages, {
      maxTokens: GimmickWebSearchCore.LLM_MAX_TOKENS,
      webSearch: true,
      jsonOutput: true,
      jsonSchema: z.object({
        result: z
          .string()
          .describe(
            `The detailed findings from your search. Limit its length to ${maxResultLength} characters.`
          ),
        summary: z
          .string()
          .describe(
            `A concise overview of the findings. Limit its length to ${maxSummaryLength} characters.`
          ),
      }),
      verbose: ENV.DEBUG,
    });

    const summary = (responseJson.summary as string).substring(
      0,
      maxSummaryLength
    );
    const result = (responseJson.result as string).substring(
      0,
      maxResultLength
    );

    if (ENV.DEBUG) {
      console.log(`Gimmick ${this.gimmick.name} executed: ${query}`);
      console.log(`Summary: ${summary}`);
    }

    await entity.location.updateCanvas(
      entity.type,
      entity.id,
      this.canvas.name,
      result
    );
    await entity.location.addSystemMessage(
      `Gimmick ${this.gimmick.name} executed. Web Search Result: ${summary}`
    );
    await entity.location.emitAsync('gimmickExecuted', this, entity, summary);
  }

  public override async update(): Promise<boolean> {
    return false;
  }

  public override async execute(
    entity: Entity,
    parameters: GimmickParameters
  ): Promise<boolean> {
    const llmOptions: Partial<LlmServiceOptions> = this.meta.options ?? {};
    llmOptions.platform ??= GimmickWebSearchCore.DEFAULT_LLM_PLATFORM;
    llmOptions.model ??= GimmickWebSearchCore.DEFAULT_LLM_MODEL;
    llmOptions.apiKey ??= entity.location.apiKeys[llmOptions.platform]?.key;
    if (!llmOptions.apiKey) {
      throw new Error('No API key found');
    }

    const llm = LlmFactory.create(llmOptions as LlmServiceOptions);
    void this.searchWeb(entity, llm, parameters as string);

    return true;
  }
}
