import { z } from 'zod';

export const LlmPlatform = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  GEMINI: 'GEMINI',
  DEEPSEEK: 'DEEPSEEK',
  XAI: 'XAI',
} as const;

export type LlmPlatform = (typeof LlmPlatform)[keyof typeof LlmPlatform];

export const LlmThinkingLevel = {
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
} as const;

export type LlmThinkingLevel =
  (typeof LlmThinkingLevel)[keyof typeof LlmThinkingLevel];

export const LlmOutputVerbosity = {
  low: 'low',
  medium: 'medium',
  high: 'high',
} as const;

export type LlmOutputVerbosity =
  (typeof LlmOutputVerbosity)[keyof typeof LlmOutputVerbosity];

export const LlmResponseType = {
  text: 'text',
  image: 'image',
  audio: 'audio',
} as const;

export type LlmResponseType =
  (typeof LlmResponseType)[keyof typeof LlmResponseType];

export interface LlmServiceOptions {
  model: string;
  platform: LlmPlatform;
  apiKey: string;
  thinking?: boolean;
  baseUrl?: string;

  supportThinkingLevel?: boolean;
  supportOutputVerbosity?: boolean;
}

export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  maxThinkingTokens?: number;
  thinkingLevel?: LlmThinkingLevel;
  outputVerbosity?: LlmOutputVerbosity;
  maxTries?: number;
  retryDelay?: number;
  responseTypes?: LlmResponseType[];
  jsonOutput?: boolean;
  jsonSchema?: z.ZodSchema;
  webSearch?: boolean;
  verbose?: boolean;
  /**
   * Tool fields to track for incremental streaming updates.
   * Format: [toolName, argumentKey] pairs
   * @example [['send_message', 'message'], ['send_casual_message', 'casualPolicyViolatingAnswer']]
   */
  trackToolFields?: Array<[string, string]>;
}

export interface LlmMessageImageContent {
  type: 'image';
  image: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
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
  thinkingLevel?: LlmThinkingLevel;
  temperature?: number;

  // Token Usage
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cachedInputTokens?: number;
  cacheCreationTokens?: number;

  // Request and Response
  request: object;
  response: object;

  // Logging
  logType?: LlmUsageType;
  responseTime: number; // Response time in milliseconds
}

export interface LlmGenerateResponseWebSearchSource {
  url: string;
  title: string;

  startIndex: number;
  endIndex: number;
  content: string;
}

export interface LlmGenerateResponse<T extends boolean = false>
  extends LlmResponseBase {
  content: T extends true ? Record<string, unknown> : string;
  sources?: LlmGenerateResponseWebSearchSource[];
}

export interface LlmToolsResponse extends LlmResponseBase {
  toolCalls: Array<{
    name: string;
    arguments: unknown;
  }>;
}

export interface LlmToolsStreamChunk {
  type: 'toolCall';
  toolCall: {
    name: string;
    arguments: unknown;
  };
  index: number;
}

export interface LlmToolsStreamFieldChunk {
  type: 'field';
  index: number;
  toolName: string;
  argumentKey: string;
  value: string;
  delta: string;
}

export type LlmToolsStreamEvent =
  | LlmToolsStreamChunk
  | LlmToolsStreamFieldChunk;
