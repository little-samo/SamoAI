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
  public static readonly DEFAULT_SEARCH_LLM_PLATFORM = LlmPlatform.GEMINI;
  public static readonly DEFAULT_SEARCH_LLM_MODEL =
    'gemini-2.5-flash-preview-04-17';
  public static readonly LLM_MAX_TOKENS = 2048;
  public static readonly LLM_MAX_REASONING_TOKENS = 2048;
  public static readonly DEFAULT_MAX_SEARCH_RESULT_LENGTH = 2000;

  public override get description(): string {
    return 'Searches the web for up-to-date or missing information using an LLM, providing both a summary and detailed results. Execution takes approximately 30 seconds.';
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
    searchLlm: LlmService,
    query: string,
    maxLlmResultLength: number,
    maxLlmSummaryLength: number,
    maxResultLength: number,
    maxSummaryLength: number,
    maxTokens: number,
    maxReasoningTokens: number
  ): Promise<void> {
    const messages: LlmMessage[] = [];
    messages.push({
      role: 'system',
      content: `
You are tasked with performing a web search based on the user's query and then processing the results. Generate two outputs in a STRICTLY VALID JSON format:
1.  'result': A detailed compilation of the most important information found in the search results. Aim to be comprehensive and informative within the character limit of ${maxLlmResultLength}. Include key facts, data points, or direct quotes where relevant. Prioritize official sources, expert opinions, and well-established publications. Pay attention to the publication date to ensure the information is up-to-date.
2.  'summary': A concise paragraph summarizing the key findings from the search results. This summary must not exceed ${maxLlmSummaryLength} characters and should reflect the essence of the detailed result.

# Constraints
- Verify the credibility of sources by cross-referencing information with multiple trusted websites if possible based on search results.
- Ensure the output is ONLY a valid JSON object with no extra text, markdown, or formatting outside the JSON structure.
- Adhere strictly to the character limits for 'result' (${maxLlmResultLength}) and 'summary' (${maxLlmSummaryLength}). Truncation will occur if limits are exceeded.

# Output Format
{
  "result": "Detailed information compilation...",
  "summary": "Concise summary paragraph..."
}
`.trim(),
    });
    messages.push({
      role: 'user',
      content: query,
    });

    try {
      const searchSummaryResult = await searchLlm.generate(messages, {
        maxTokens: maxTokens,
        maxReasoningTokens: maxReasoningTokens,
        webSearch: true,
        jsonOutput: true,
        verbose: ENV.DEBUG,
      });

      const rawSummary =
        typeof searchSummaryResult?.summary === 'string'
          ? searchSummaryResult.summary
          : '';
      const rawResult =
        typeof searchSummaryResult?.result === 'string'
          ? searchSummaryResult.result
          : '';

      const summary = rawSummary.substring(0, maxSummaryLength);
      const result = rawResult.substring(0, maxResultLength);

      if (ENV.DEBUG) {
        console.log(`Gimmick ${this.gimmick.name} executed: ${query}`);
        console.log(`Summary: ${summary}`);
      }

      await entity.updateCanvas(this.canvas.name, result);
      await entity.location.addGimmickMessage(this.gimmick, {
        message: `Web Search Result: ${summary}`,
      });
      await entity.location.emitAsync(
        'gimmickExecuted',
        this.gimmick,
        entity,
        summary
      );
    } catch (error) {
      console.error(
        `Error executing gimmick ${this.gimmick.name} for entity ${entity.name}:`,
        error
      );
      await entity.location.addGimmickMessage(this.gimmick, {
        message: `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      await entity.location.emitAsync(
        'gimmickFailed',
        this.gimmick,
        entity,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  public override async update(): Promise<boolean> {
    return false;
  }

  public override async execute(
    entity: Entity,
    parameters: GimmickParameters
  ): Promise<string | undefined> {
    if (!parameters || typeof parameters !== 'string') {
      return 'Invalid query provided';
    }
    const query = parameters as string;

    const llmSearchOptions: Partial<LlmServiceOptions> =
      this.meta.options?.llm ?? {};
    llmSearchOptions.platform ??=
      GimmickWebSearchCore.DEFAULT_SEARCH_LLM_PLATFORM;
    llmSearchOptions.model ??= GimmickWebSearchCore.DEFAULT_SEARCH_LLM_MODEL;
    llmSearchOptions.apiKey ??=
      entity.location.apiKeys[llmSearchOptions.platform]?.key;
    const maxTokens = Number(
      this.meta.options?.maxTokens ?? GimmickWebSearchCore.LLM_MAX_TOKENS
    );
    const maxReasoningTokens = Number(
      this.meta.options?.maxReasoningTokens ??
        GimmickWebSearchCore.LLM_MAX_REASONING_TOKENS
    );
    if (!llmSearchOptions.apiKey) {
      return 'No API key found';
    }

    const searchLlm = LlmFactory.create(llmSearchOptions as LlmServiceOptions);

    const maxResultLength = Number(
      this.meta.options?.maxResultLength ??
        GimmickWebSearchCore.DEFAULT_MAX_SEARCH_RESULT_LENGTH
    );
    const maxLlmResultLength = maxResultLength - 200; // Reserve buffer
    const maxSummaryLength = this.gimmick.location.meta.messageLengthLimit;
    const maxLlmSummaryLength = maxSummaryLength - 50; // Reserve buffer

    const promise = this.searchWeb(
      entity,
      searchLlm,
      query,
      maxLlmResultLength,
      maxLlmSummaryLength,
      maxResultLength,
      maxSummaryLength,
      maxTokens,
      maxReasoningTokens
    );

    await this.gimmick.location.emitAsync(
      'gimmickExecuting',
      this.gimmick,
      entity,
      parameters,
      promise
    );

    return undefined;
  }
}
