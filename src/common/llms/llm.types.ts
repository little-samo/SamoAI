export const LlmPlatform = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
} as const;

export type LlmPlatform = (typeof LlmPlatform)[keyof typeof LlmPlatform];
