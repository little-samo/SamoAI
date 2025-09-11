import {
  ENV,
  LlmFactory,
  LlmGenerateResponse,
  LlmInvalidContentError,
  LlmPlatform,
  LlmService,
  LlmServiceOptions,
  LlmThinkingLevel,
  LlmUsageType,
  LlmOutputVerbosity,
  truncateString,
} from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { type LocationEntityCanvasMeta } from '../../../locations/location.meta';
import { type Entity } from '../../entity';
import { GimmickParameters } from '../gimmick.types';
import { GimmickInputFactory } from '../inputs';

import { GimmickCore } from './gimmick.core';
import { RegisterGimmickCore } from './gimmick.core-decorator';

@RegisterGimmickCore('web_search')
export class GimmickWebSearchCore extends GimmickCore {
  public static readonly DEFAULT_SEARCH_LLM_PLATFORM = LlmPlatform.OPENAI;
  public static readonly DEFAULT_SEARCH_LLM_MODEL = 'gpt-5-mini';
  public static readonly DEFAULT_SEARCH_LLM_THINKING = true;
  public static readonly DEFAULT_SEARCH_LLM_THINKING_LEVEL =
    LlmThinkingLevel.low;
  public static readonly DEFAULT_SEARCH_LLM_OUTPUT_VERBOSITY =
    LlmOutputVerbosity.low;
  public static readonly LLM_MAX_TOKENS = 8192;
  public static readonly LLM_MAX_THINKING_TOKENS = 2048;
  public static readonly DEFAULT_MAX_SEARCH_RESULT_LENGTH = 3000;
  public static readonly DEFAULT_MAX_SEARCH_SOURCES_LENGTH = 2000;

  public override get description(): string {
    return 'Searches the web for up-to-date or missing information using an LLM, providing both a summary and detailed results with original source links. The gimmick can see the full location context including conversation history and agent information to conduct more targeted and relevant searches. Execution takes approximately 30 seconds.';
  }

  public override get parameters(): z.ZodSchema {
    return z
      .string()
      .max(500)
      .describe(
        'Search query or topic. The gimmick will automatically enhance your query using conversation context, location details, and agent information to conduct more targeted searches. You can use natural language and reference previous conversations.'
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
    maxThinkingTokens: number,
    thinkingLevel: LlmThinkingLevel,
    outputVerbosity: LlmOutputVerbosity
  ): Promise<void> {
    // Use the new input system to build rich contextual messages
    const inputBuilder = GimmickInputFactory.createInput(
      'web_search',
      entity.location,
      this.gimmick,
      entity,
      query
    );
    const messages = inputBuilder.build({
      parameters: query,
      maxLlmResultLength,
      maxLlmSummaryLength,
      timezone: entity.timezone,
    });

    let searchSummaryResponse: LlmGenerateResponse<false>;
    try {
      searchSummaryResponse = await searchLlm.generate(messages, {
        maxTokens,
        maxThinkingTokens,
        thinkingLevel,
        outputVerbosity,
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

    // First handle cases where tags are opened but not closed
    let processedOutput = llmOutput;

    // Handle <SearchBody>: if opening tag exists but closing tag is missing
    const bodyOpenIndex = processedOutput.indexOf('<SearchBody>');
    const bodyCloseIndex = processedOutput.indexOf('</SearchBody>');
    if (bodyOpenIndex !== -1 && bodyCloseIndex === -1) {
      processedOutput = processedOutput + '</SearchBody>';
    }

    // Handle <SearchSummary>: if opening tag exists but closing tag is missing
    const summaryOpenIndex = processedOutput.indexOf('<SearchSummary>');
    const summaryCloseIndex = processedOutput.indexOf('</SearchSummary>');
    if (summaryOpenIndex !== -1 && summaryCloseIndex === -1) {
      processedOutput = processedOutput + '</SearchSummary>';
    }

    const bodyMatch = processedOutput.match(
      /<SearchBody>([\s\S]*?)<\/SearchBody>/
    );
    const summaryMatch = processedOutput.match(
      /<SearchSummary>([\s\S]*?)<\/SearchSummary>/
    );

    if (bodyMatch?.[1] && summaryMatch?.[1]) {
      result = bodyMatch[1].trim();
      summary = summaryMatch[1].trim();
    } else {
      const strippedOutput = processedOutput.replace(/<[^>]*>/g, '').trim();
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
        .map(
          (source, index) => `[${index + 1}] ${source.title} (${source.url})`
        )
        .join('\n');
      result += sources;
      result = truncateString(result, maxResultLength + maxSourcesLength).text;
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
      return 'Invalid search query provided. Please provide a raw string query, not a JSON object or other data type.';
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
    const thinkingLevel = (this.meta.options?.thinkingLevel ??
      GimmickWebSearchCore.DEFAULT_SEARCH_LLM_THINKING_LEVEL) as LlmThinkingLevel;
    const outputVerbosity = (this.meta.options?.outputVerbosity ??
      GimmickWebSearchCore.DEFAULT_SEARCH_LLM_OUTPUT_VERBOSITY) as LlmOutputVerbosity;
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
      maxThinkingTokens,
      thinkingLevel,
      outputVerbosity
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
