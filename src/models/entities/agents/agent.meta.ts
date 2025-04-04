import { LlmPlatform } from '@little-samo/samo-ai/common';

import { EntityMeta } from '../entity.meta';

export interface AgentLlmMeta {
  platform: LlmPlatform;
  model: string;
  reasoning?: boolean;
}

export interface AgentMeta extends EntityMeta {
  core: string;

  temperature: number;
  maxTokens: number;
  evaluateTemperature: number;
  evaluateMaxTokens: number;
  llms: AgentLlmMeta[];
  inputs: string[];
  languages: string[];
  timeZone: string;
  greeting?: string;

  actions: string[];
  requiredActions: string[];

  memoryLimit: number;
  memoryLengthLimit: number;
  entityMemoryLimit: number;
  entityMemoryLengthLimit: number;

  summaryLengthLimit: number;

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
  core: 'execute_actions',

  temperature: 0.5,
  maxTokens: 1536,
  evaluateTemperature: 0.3,
  evaluateMaxTokens: 1024,
  llms: [
    { platform: LlmPlatform.ANTHROPIC, model: 'claude-3-7-sonnet-20250219' },
    { platform: LlmPlatform.GEMINI, model: 'gemini-2.0-flash-001' },
  ],
  inputs: ['character'],
  languages: ['English'],
  timeZone: 'UTC',

  actions: [
    'update_memory:latest',
    'update_entity_memory:latest',
    'transfer_item:latest',
  ],
  requiredActions: [],

  memoryLimit: 24,
  memoryLengthLimit: 250,
  entityMemoryLimit: 12,
  entityMemoryLengthLimit: 250,

  summaryLengthLimit: 1000,

  appearance: 'Typical human (but AI Agent)',
  character: {},

  rules: [],
};
