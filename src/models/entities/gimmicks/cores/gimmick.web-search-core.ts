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
  truncateString,
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
  public static readonly DEFAULT_SEARCH_LLM_MODEL = 'gemini-2.5-flash';
  public static readonly DEFAULT_SEARCH_LLM_THINKING = true;
  public static readonly LLM_MAX_TOKENS = 1024;
  public static readonly LLM_MAX_THINKING_TOKENS = 2048;
  public static readonly DEFAULT_MAX_SEARCH_RESULT_LENGTH = 2000;
  public static readonly DEFAULT_MAX_SEARCH_SOURCES_LENGTH = 1000;

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
    const maxSearchResultLength = Number(
      this.meta.options?.maxResultLength ??
        GimmickWebSearchCore.DEFAULT_MAX_SEARCH_RESULT_LENGTH
    );
    const maxSearchSourcesLength = Number(
      this.meta.options?.maxSourcesLength ??
        GimmickWebSearchCore.DEFAULT_MAX_SEARCH_SOURCES_LENGTH
    );
    return (
      super.canvas ?? {
        name: 'web_search',
        description: 'Displays the detailed results of the web search.',
        maxLength: maxSearchResultLength + maxSearchSourcesLength,
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
    maxSourcesLength: number,
    maxTokens: number,
    maxThinkingTokens: number
  ): Promise<void> {
    const messages: LlmMessage[] = [];
    messages.push({
      role: 'system',
      content: `
You are a web research expert. Your mission is to conduct a web search based on the user's query, then organize the results into a detailed body and a brief summary.

Format your response exclusively as the following XML structure. Do not add any text, explanations, or markdown outside of this format.

<SearchBody>
A thorough compilation of the most critical information discovered during the web search. Aim for comprehensiveness and clarity within a ${maxLlmResultLength} character limit. It is wise to leave a small margin, as character counting is not always precise. Include essential facts, data points, and direct quotations when appropriate. Give priority to official sources, expert analyses, and recent, reputable publications.
</SearchBody>
<SearchSummary>
A concise paragraph that summarizes the main discoveries from the search. This summary should not be more than ${maxLlmSummaryLength} characters and must distill the core message of the detailed body.
</SearchSummary>

# Critical Guidelines
- Validate source credibility by cross-referencing information with multiple reliable websites whenever search results permit.
- Do not manually add source citations like [1], [2], etc. The system will automatically handle source attribution.
- Strictly follow the character limits for content within the <SearchBody> (${maxLlmResultLength} characters) and <SearchSummary> (${maxLlmSummaryLength} characters) tags. Content might be cut off if it goes over these limits, so plan for a buffer.
- Your entire response must be only the XML structure shown. Make sure all tags are correctly closed.
`.trim(),
    });
    messages.push({
      role: 'user',
      content: query,
    });

    let searchSummaryResponse: LlmGenerateResponse<false>;
    try {
      searchSummaryResponse = await searchLlm.generate(messages, {
        maxTokens: maxTokens,
        maxThinkingTokens: maxThinkingTokens,
        webSearch: true,
        verbose: ENV.VERBOSE_LLM,
      });
    } catch (error) {
      if (error instanceof LlmInvalidContentError && error.llmResponse) {
        error.llmResponse.logType = LlmUsageType.GIMMICK;
        await entity.location.emitAsync(
          'llmGenerate',
          entity,
          error.llmResponse,
          this.gimmick
        );
      }
      throw error;
    }

    searchSummaryResponse.logType = LlmUsageType.GIMMICK;
    await entity.location.emitAsync(
      'llmGenerate',
      entity,
      searchSummaryResponse,
      this.gimmick
    );

    let llmOutput = searchSummaryResponse.content;
    if (searchSummaryResponse.sources) {
      // Process sources in reverse order to avoid numbering conflicts
      for (let i = searchSummaryResponse.sources.length - 1; i >= 0; i--) {
        const source = searchSummaryResponse.sources[i];
        // Note: The index values may be in bytes, not characters, so we use replace instead of slice.
        llmOutput = llmOutput.replace(
          source.content,
          `${source.content}[${i + 1}]`
        );
      }
    }

    let summary: string;
    let result: string;

    const bodyMatch = llmOutput.match(/<SearchBody>([\s\S]*?)<\/SearchBody>/);
    const summaryMatch = llmOutput.match(
      /<SearchSummary>([\s\S]*?)<\/SearchSummary>/
    );

    if (bodyMatch?.[1] && summaryMatch?.[1]) {
      result = bodyMatch[1].trim();
      summary = summaryMatch[1].trim();
    } else {
      const strippedOutput = llmOutput.replace(/<[^>]*>/g, '').trim();
      result = strippedOutput;
      summary = strippedOutput.substring(0, maxLlmSummaryLength);
    }

    result = truncateString(result, maxResultLength).text;

    if (
      searchSummaryResponse.sources &&
      searchSummaryResponse.sources.length > 0
    ) {
      let sources = `\n\n[Sources]\n`;
      sources += searchSummaryResponse.sources
        .map((source, index) => `[${index + 1}] ${source.title}`)
        .join('\n');
      sources = truncateString(sources, maxSourcesLength).text;
      result += sources;
    }

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

    const maxResultLength =
      Number(
        this.meta.options?.maxResultLength ??
          GimmickWebSearchCore.DEFAULT_MAX_SEARCH_RESULT_LENGTH
      ) - 200; // Reserve for source citations
    const maxLlmResultLength = maxResultLength; // Use full length, let LLM consider buffer
    const maxSummaryLength = this.gimmick.location.meta.messageLengthLimit;
    const maxLlmSummaryLength = maxSummaryLength - 20; // Reserve for "Web Search Result: " prefix
    const maxSourcesLength =
      Number(
        this.meta.options?.maxSourcesLength ??
          GimmickWebSearchCore.DEFAULT_MAX_SEARCH_SOURCES_LENGTH
      ) - 10; // Reserve for "[Sources]" prefix

    const promise = this.searchWeb(
      entity,
      searchLlm,
      query,
      maxLlmResultLength,
      maxLlmSummaryLength,
      maxResultLength,
      maxSummaryLength,
      maxSourcesLength,
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
