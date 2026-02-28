import { z } from 'zod';

import { parseAndFixJson } from '../utils';

export interface LlmTool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
}

export interface LlmToolCall {
  name: string;
  arguments: unknown;
}

/**
 * Normalizes a single raw tool call object into LlmToolCall format.
 * Handles key variations: name/function/tool, arguments/parameters/params/args
 */
export function normalizeToolCall(raw: Record<string, unknown>): LlmToolCall {
  return {
    name: (raw.name ?? raw.function ?? raw.tool ?? '') as string,
    arguments: raw.arguments ?? raw.parameters ?? raw.params ?? raw.args ?? {},
  };
}

/**
 * Parses raw JSON text and extracts normalized LlmToolCall[].
 * Handles common key variations from different LLM providers:
 *  - toolCalls / tool_calls
 *  - name / function / tool
 *  - arguments / parameters / params / args
 */
export function parseToolCallsFromJson(jsonText: string): LlmToolCall[] {
  const parsed = parseAndFixJson<Record<string, unknown>>(jsonText);

  const rawToolCalls = parsed.toolCalls ?? parsed.tool_calls;
  if (!Array.isArray(rawToolCalls)) {
    return [];
  }

  return rawToolCalls.map((tc: Record<string, unknown>) =>
    normalizeToolCall(tc)
  );
}
