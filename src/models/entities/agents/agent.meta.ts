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
  inputs: string[];
  languages: string[];
  timeZone: string;

  actionLimit: number;
  actions: string[];

  memoryLimit: number;
  memoryLengthLimit: number;
  entityMemoryLimit: number;
  entityMemoryLengthLimit: number;
  // Agent's characteristics and personality traits
  character: {
    // Background information
    background?: {
      role?: string | string[]; // Agent's role (professor, assistant, coach)
      gender?: string | string[]; // Gender
      expertise?: string | string[]; // Areas of expertise
      backstory?: string | string[]; // Background story
      birthDate?: string | string[]; // Birth date (YYYY-MM-DD format)
      occupation?: string | string[]; // Current or past occupation
      [key: string]: undefined | string | string[]; // Additional background properties
    };

    // Communication style
    speech?: {
      tone?: string | string[]; // How the agent speaks (friendly, formal, professional)
      style?: string | string[]; // Conversation style (concise, detailed, humorous)
      formality?: string | string[]; // Level of formality
      [key: string]: undefined | string | string[]; // Additional speech properties
    };

    // Personality aspects
    personality?: {
      traits?: string | string[]; // Key personality traits (empathetic, analytical, creative)
      interests?: string | string[]; // Topics of interest
      values?: string | string[]; // Core values and beliefs
      quirks?: string | string[]; // Unique habits or characteristics
      mbti?: string | string[]; // MBTI personality type
      [key: string]: undefined | string | string[]; // Additional personality properties
    };

    // Additional characteristics
    [key: string]:
      | undefined
      | string
      | string[]
      | {
          [key: string]: undefined | string | string[]; // Additional properties
        };
  };

  rules: string[];
}

export const DEFAULT_AGENT_META: AgentMeta = {
  core: 'empty',

  temperature: 0.5,
  maxTokens: 1024,
  llms: [
    { platform: LlmPlatform.ANTHROPIC, model: 'claude-3-5-sonnet-20241022' },
    { platform: LlmPlatform.OPENAI, model: 'gpt-4o-2024-11-20' },
  ],
  inputs: ['character'],
  languages: ['English'],
  timeZone: 'UTC',

  actionLimit: 6,
  actions: ['update_memory:latest', 'update_entity_memory:latest'],

  memoryLimit: 32,
  memoryLengthLimit: 500,
  entityMemoryLimit: 8,
  entityMemoryLengthLimit: 500,

  appearance: 'Typical human (but AI Agent)',
  character: {},

  rules: [],
};
