import {
  ENV,
  LlmFactory,
  LlmGenerateResponse,
  LlmInvalidContentError,
  LlmMessage,
  LlmPlatform,
  LlmService,
  LlmServiceOptions,
  LlmUsageType,
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
  public static readonly DEFAULT_SEARCH_LLM_MODEL = 'gemini-2.5-pro';
  public static readonly DEFAULT_SEARCH_LLM_THINKING = true;
  public static readonly LLM_MAX_TOKENS = 4096;
  public static readonly LLM_MAX_THINKING_TOKENS = 2048;
  public static readonly DEFAULT_MAX_SEARCH_RESULT_LENGTH = 2000;

  public override get description(): string {
    return 'Searches the web for up-to-date or missing information using an LLM, providing both a summary and detailed results. Execution takes approximately 30 seconds. IMPORTANT: This gimmick does NOT have access to your conversation context, so provide complete, self-contained search queries with all necessary details, keywords, and context as if searching independently on Google.';
  }

  public override get parameters(): z.ZodSchema {
    return z
      .string()
      .describe(
        'A detailed, comprehensive search query that includes all relevant context, specific terms, dates, locations, or other important details. Since this gimmick has no access to conversation context, write complete queries as you would on Google. Avoid vague terms like "this", "that", or references to previous conversation.'
      );
  }

  public override get canvas(): LocationEntityCanvasMeta {
    return (
      super.canvas ?? {
        name: 'web_search',
        description: 'Displays the detailed results of the web search.',
        maxLength: GimmickWebSearchCore.DEFAULT_MAX_SEARCH_RESULT_LENGTH,
      }
    );
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
    maxThinkingTokens: number
  ): Promise<void> {
    const messages: LlmMessage[] = [];
    messages.push({
      role: 'system',
      content: `
You are tasked with performing a web search based on the user's query and then processing the results. Generate two outputs in a STRICTLY VALID JSON format:
1.  'result': A detailed compilation of the most important information found in the search results. Aim to be comprehensive and informative within the character limit of ${maxLlmResultLength}, but consider leaving some buffer space as character count estimation can be inaccurate. Include key facts, data points, or direct quotes where relevant. Prioritize official sources, expert opinions, and well-established publications. Pay attention to the publication date to ensure the information is up-to-date.
2.  'summary': A concise paragraph summarizing the key findings from the search results. This summary must not exceed ${maxLlmSummaryLength} characters and should reflect the essence of the detailed result. Consider leaving some buffer space as character count estimation can be inaccurate.

# Constraints
- Verify the credibility of sources by cross-referencing information with multiple trusted websites if possible based on search results.
- Ensure the output is ONLY a valid JSON object with no extra text, markdown, or formatting outside the JSON structure.
- Adhere strictly to the character limits for 'result' (${maxLlmResultLength}) and 'summary' (${maxLlmSummaryLength}), but consider leaving buffer space as character count estimation can be inaccurate. Truncation will occur if limits are exceeded.

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

    let searchSummaryResponse: LlmGenerateResponse<true>;
    try {
      searchSummaryResponse = await searchLlm.generate(messages, {
        maxTokens: maxTokens,
        maxThinkingTokens: maxThinkingTokens,
        webSearch: true,
        jsonOutput: true,
        verbose: ENV.VERBOSE_LLM,
      });
    } catch (error) {
      if (error instanceof LlmInvalidContentError && error.llmResponse) {
        error.llmResponse.logType = LlmUsageType.GIMMICK;
        await entity.location.emitAsync(
          'llmGenerate',
          this.gimmick,
          error.llmResponse,
          entity
        );
      }
      throw error;
    }

    searchSummaryResponse.logType = LlmUsageType.GIMMICK;
    await entity.location.emitAsync(
      'llmGenerate',
      this.gimmick,
      searchSummaryResponse,
      entity
    );

    const searchSummaryResult = searchSummaryResponse.content;
    const summary =
      typeof searchSummaryResult?.summary === 'string'
        ? searchSummaryResult.summary
        : '';
    const result =
      typeof searchSummaryResult?.result === 'string'
        ? searchSummaryResult.result
        : '';

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
      result,
      summary
    );
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
    llmSearchOptions.thinking ??=
      GimmickWebSearchCore.DEFAULT_SEARCH_LLM_THINKING;
    llmSearchOptions.apiKey ??=
      entity.location.apiKeys[llmSearchOptions.platform]?.key;
    const maxTokens = Number(
      this.meta.options?.maxTokens ?? GimmickWebSearchCore.LLM_MAX_TOKENS
    );
    const maxThinkingTokens = Number(
      this.meta.options?.maxThinkingTokens ??
        GimmickWebSearchCore.LLM_MAX_THINKING_TOKENS
    );
    if (!llmSearchOptions.apiKey) {
      return 'No API key found';
    }

    const searchLlm = LlmFactory.create(llmSearchOptions as LlmServiceOptions);

    const maxResultLength = Number(
      this.meta.options?.maxResultLength ??
        GimmickWebSearchCore.DEFAULT_MAX_SEARCH_RESULT_LENGTH
    );
    const maxLlmResultLength = maxResultLength; // Use full length, let LLM consider buffer
    const maxSummaryLength = this.gimmick.location.meta.messageLengthLimit;
    const maxLlmSummaryLength = maxSummaryLength - 20; // Reserve for "Web Search Result: " prefix

    const promise = this.searchWeb(
      entity,
      searchLlm,
      query,
      maxLlmResultLength,
      maxLlmSummaryLength,
      maxResultLength,
      maxSummaryLength,
      maxTokens,
      maxThinkingTokens
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
