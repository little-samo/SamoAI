import { LLMPlatform } from '@prisma/client';

import { EntityMeta } from '../entity.meta';

export interface AgentMeta extends EntityMeta {
  core: string;

  temperature: number;
  maxTokens: number;
  models: LLMPlatform[];
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
  models: [LLMPlatform.ANTHROPIC],
  languages: ['English'],

  actionLimit: 6,
  actions: ['REASONING', 'SEND_CASUAL_MESSAGE', 'UPDATE_MEMORY'],

  memoryLimit: 16,
  entityMemoryLimit: 8,

  character: {},
};
