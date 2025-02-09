import { z } from 'zod';

export interface LlmTool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
}

export interface LlmToolCall {
  name: string;
  arguments: unknown;
}
