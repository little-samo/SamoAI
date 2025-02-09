import { LlmPlatform } from '@prisma/client';

import { EntityMeta } from '../entity.meta';

export interface AgentLlmMeta {
  platform: LlmPlatform;
  model: string;
}

export interface AgentMeta extends EntityMeta {
  core: string;

  temperature: number;
  maxTokens: number;
  llms: AgentLlmMeta[];
  languages: string[];

  actionLimit: number;
  actions: string[];

  memoryLimit: number;
  entityMemoryLimit: number;

  // Agent's characteristics and personality traits
  character: {
    // Background information
    background?: {
      role?: string; // Agent's role (professor, assistant, coach)
      expertise?: string[]; // Areas of expertise
      backstory?: string; // Background story
      birthDate?: string; // Birth date (YYYY-MM-DD format)
      occupation?: string; // Current or past occupation
      [key: string]: undefined | string | string[]; // Additional background properties
    };

    // Communication style
    speech?: {
      tone?: string; // How the agent speaks (friendly, formal, professional)
      style?: string; // Conversation style (concise, detailed, humorous)
      formality?: string; // Level of formality
      [key: string]: undefined | string | string[]; // Additional speech properties
    };

    // Personality aspects
    personality?: {
      traits?: string[]; // Key personality traits (empathetic, analytical, creative)
      interests?: string[]; // Topics of interest
      values?: string[]; // Core values and beliefs
      quirks?: string[]; // Unique habits or characteristics
      mbti?: string; // MBTI personality type
      [key: string]: undefined | string | string[]; // Additional personality properties
    };

    // Additional characteristics
    [key: string]:
      | undefined
      | {
          [key: string]: undefined | string | string[]; // Additional properties
        };
  };
}

export const DEFAULT_AGENT_META: AgentMeta = {
  core: 'empty',

  temperature: 0.5,
  maxTokens: 1000,
  llms: [
    { platform: LlmPlatform.ANTHROPIC, model: 'claude-3-5-sonnet-20241022' },
  ],
  languages: ['English'],

  actionLimit: 6,
  actions: ['send_casual_message', 'update_memory'],

  memoryLimit: 16,
  entityMemoryLimit: 8,

  character: {},
};
