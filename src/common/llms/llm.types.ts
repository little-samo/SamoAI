import { z } from 'zod';

export const LlmPlatform = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  GEMINI: 'GEMINI',
} as const;

export type LlmPlatform = (typeof LlmPlatform)[keyof typeof LlmPlatform];

export interface LlmServiceOptions {
  model: string;
  platform: LlmPlatform;
  apiKey: string;
  reasoning?: boolean;
}

export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  maxReasoningTokens?: number;
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
