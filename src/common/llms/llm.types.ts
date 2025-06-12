import { z } from 'zod';

export const LlmPlatform = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  GEMINI: 'GEMINI',
  DEEPSEEK: 'DEEPSEEK',
} as const;

export type LlmPlatform = (typeof LlmPlatform)[keyof typeof LlmPlatform];

export interface LlmServiceOptions {
  model: string;
  platform: LlmPlatform;
  apiKey: string;
  thinking?: boolean;
  baseUrl?: string;
}

export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  maxThinkingTokens?: number;
  maxTries?: number;
  retryDelay?: number;
  jsonOutput?: boolean;
  jsonSchema?: z.ZodSchema;
  webSearch?: boolean;
  verbose?: boolean;
}

export interface LlmMessageImageContent {
  type: 'image';
  image: string;
}

export interface LlmMessageTextContent {
  type: 'text';
  text: string;
}

export type LlmMessageContent = LlmMessageImageContent | LlmMessageTextContent;

export interface LlmUserMessage {
  role: 'user';
  content: string | LlmMessageContent[];
}

export interface LlmAssistantMessage {
  role: 'assistant';
  content: string;
}

export interface LlmSystemMessage {
  role: 'system';
  content: string;
}

export type LlmMessage =
  | LlmUserMessage
  | LlmAssistantMessage
  | LlmSystemMessage;

export const LlmUsageType = {
  UNKNOWN: 'UNKNOWN',
  EVALUATION: 'EVALUATION',
  EXECUTION: 'EXECUTION',
  SUMMARY: 'SUMMARY',
  MEMORY: 'MEMORY',
  GIMMICK: 'GIMMICK',
} as const;

export type LlmUsageType = (typeof LlmUsageType)[keyof typeof LlmUsageType];

// LLM Response interfaces for Prisma logging
export interface LlmResponseBase {
  // Model Information
  platform: LlmPlatform;
  model: string;
  thinking: boolean;

  // Request Configuration
  maxOutputTokens?: number;
  thinkingBudget?: number;
  temperature?: number;

  // Token Usage
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cachedInputTokens?: number;
  cacheCreationTokens?: number;

  logType?: LlmUsageType;
  responseTime: number; // Response time in milliseconds
}

export interface LlmGenerateResponse<T extends boolean = false>
  extends LlmResponseBase {
  content: T extends true ? Record<string, unknown> : string;
}

export interface LlmToolsResponse extends LlmResponseBase {
  toolCalls: Array<{
    name: string;
    arguments: unknown;
  }>;
}
