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
  public static readonly DEFAULT_SEARCH_LLM_PLATFORM = LlmPlatform.OPENAI;
  public static readonly DEFAULT_SEARCH_LLM_MODEL =
    'gpt-4o-search-preview-2025-03-11';
  public static readonly DEFAULT_SUMMARY_LLM_PLATFORM = LlmPlatform.GEMINI;
  public static readonly DEFAULT_SUMMARY_LLM_MODEL = 'gemini-2.0-flash-001';
  public static readonly LLM_MAX_TOKENS = 2048;
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
    summaryLlm: LlmService,
    query: string
  ): Promise<void> {
    const searchMessages: LlmMessage[] = [];
    searchMessages.push({
      role: 'system',
      content: `
Your primary goal is to perform a comprehensive web search to gather the most recent, reliable, and relevant information based on the user's query. Focus on finding detailed facts, data, and source materials.

- Verify the credibility of sources by cross-referencing information with multiple trusted websites.
- Prioritize official sources, expert opinions, and well-established publications.
- Pay attention to the publication date to ensure the information is up-to-date.
- Extract key details and supporting evidence.

# Steps

1. **Identify Keywords**: Break down the user query into essential keywords to optimize the search.
2. **Execute Search**: Use effective keywords derived from the query to search the web.
3. **Evaluate Sources**: Assess the credibility and relevance of potential sources.
4. **Extract Information**: Gather detailed information, including specific facts, figures, and context from the best sources found. Do not summarize at this stage; focus on collecting comprehensive data.

# Output

Return the raw, unfiltered search results and findings. The next step will process and summarize this information.
`.trim(),
    });
    searchMessages.push({
      role: 'user',
      content: query,
    });
    const searchResult = await searchLlm.generate(searchMessages, {
      maxTokens: GimmickWebSearchCore.LLM_MAX_TOKENS,
      webSearch: true,
      verbose: ENV.DEBUG,
    });

    const maxResultLength = Number(
      this.meta.options?.maxResultLength ??
        GimmickWebSearchCore.DEFAULT_MAX_SEARCH_RESULT_LENGTH
    );
    const maxLlmResultLength = maxResultLength - 200;
    const maxSummaryLength = this.gimmick.location.meta.messageLengthLimit;
    const maxLlmSummaryLength = maxSummaryLength - 50;

    const summaryMessages: LlmMessage[] = [];
    summaryMessages.push({
      role: 'system',
      content: `
You are tasked with processing web search results. Based on the provided results, generate three outputs in a STRICTLY VALID JSON format:
1.  'reasoning': Explain your thought process for analyzing the search results and determining the key information to include in the summary and detailed result. Briefly outline the main points and how you will structure the detailed result.
2.  'result': A detailed compilation of the most important information found in the search results. Aim to be comprehensive and informative within the character limit of ${maxLlmResultLength}. Include key facts, data points, or direct quotes where relevant. Structure the information clearly based on your reasoning.
3.  'summary': A concise paragraph summarizing the key findings identified in your reasoning. This summary must not exceed ${maxLlmSummaryLength} characters and should reflect the essence of the detailed result.

# Output Format

IMPORTANT: You MUST return ONLY a valid JSON object with no extra text, markdown, or formatting outside the JSON structure.
Follow this exact format:
{
  "reasoning": "Explanation of analysis and summarization plan...",
  "result": "Detailed information compilation...",
  "summary": "Concise summary paragraph..."
}

# Important Note

If the 'result' or 'summary' exceeds the specified character limits (${maxLlmResultLength} and ${maxLlmSummaryLength} respectively), the output will be truncated. Ensure your outputs are within these limits to avoid losing information.
`.trim(),
    });
    summaryMessages.push({
      role: 'user',
      content: searchResult,
    });

    const summaryResult = await summaryLlm.generate(summaryMessages, {
      maxTokens: GimmickWebSearchCore.LLM_MAX_TOKENS,
      jsonOutput: true,
      verbose: ENV.DEBUG,
    });

    const rawSummary =
      typeof summaryResult?.summary === 'string' ? summaryResult.summary : '';
    const rawResult =
      typeof summaryResult?.result === 'string' ? summaryResult.result : '';

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

    const llmSearchOptions: Partial<LlmServiceOptions> =
      this.meta.options?.search ?? {};
    llmSearchOptions.platform ??=
      GimmickWebSearchCore.DEFAULT_SEARCH_LLM_PLATFORM;
    llmSearchOptions.model ??= GimmickWebSearchCore.DEFAULT_SEARCH_LLM_MODEL;
    llmSearchOptions.apiKey ??=
      entity.location.apiKeys[llmSearchOptions.platform]?.key;
    if (!llmSearchOptions.apiKey) {
      return 'No API key found';
    }

    const llmSummaryOptions: Partial<LlmServiceOptions> =
      this.meta.options?.summary ?? {};
    llmSummaryOptions.platform ??=
      GimmickWebSearchCore.DEFAULT_SUMMARY_LLM_PLATFORM;
    llmSummaryOptions.model ??= GimmickWebSearchCore.DEFAULT_SUMMARY_LLM_MODEL;
    llmSummaryOptions.apiKey ??=
      entity.location.apiKeys[llmSummaryOptions.platform]?.key;
    if (!llmSummaryOptions.apiKey) {
      return 'No API key found';
    }

    const searchLlm = LlmFactory.create(llmSearchOptions as LlmServiceOptions);
    const summaryLlm = LlmFactory.create(
      llmSummaryOptions as LlmServiceOptions
    );
    const promise = this.searchWeb(
      entity,
      searchLlm,
      summaryLlm,
      parameters as string
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
