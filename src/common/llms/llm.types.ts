export const LlmPlatform = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  GEMINI: 'GEMINI',
} as const;

export type LlmPlatform = (typeof LlmPlatform)[keyof typeof LlmPlatform];
