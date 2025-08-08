import {
  LlmPlatform,
  LlmServiceOptions,
  LlmThinkingLevel,
} from '@little-samo/samo-ai/common';

import { EntityMeta } from '../entity.meta';

export interface AgentPrompts {
  agentIdentity?: string;
  [key: string]: string | undefined;
}

export type AgentLlmMeta = {
  platform: LlmPlatform;
  model: string;
} & Partial<LlmServiceOptions>;

export interface AgentMeta extends EntityMeta {
  core: string;
  prompts: AgentPrompts;

  temperature: number;
  maxTokens: number;
  maxThinkingTokens: number;
  maxEvaluatationThinkingTokens: number;
  maxSummaryThinkingTokens: number;
  maxMemoryThinkingTokens: number;
  thinkingLevel: LlmThinkingLevel;
  evaluationThinkingLevel: LlmThinkingLevel;
  summaryThinkingLevel: LlmThinkingLevel;
  memoryThinkingLevel: LlmThinkingLevel;
  llms: AgentLlmMeta[];
  inputs: string[];
  languages: string[];
  timeZone: string;
  greeting?: string;

  actions: string[];
  addActions?: string[];
  canvasActions?: string[];
  memoryActions?: string[];
  memoryPostActions?: string[];
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
  prompts: {},

  temperature: 0.5,
  maxTokens: 2048,
  maxThinkingTokens: 1024,
  maxEvaluatationThinkingTokens: 512,
  maxSummaryThinkingTokens: 512,
  maxMemoryThinkingTokens: 512,
  thinkingLevel: LlmThinkingLevel.medium,
  evaluationThinkingLevel: LlmThinkingLevel.low,
  summaryThinkingLevel: LlmThinkingLevel.low,
  memoryThinkingLevel: LlmThinkingLevel.low,
  llms: [
    {
      platform: LlmPlatform.GEMINI,
      model: 'gemini-2.5-flash',
      thinking: true,
    },
    {
      platform: LlmPlatform.GEMINI,
      model: 'gemini-2.5-flash-lite',
      thinking: true,
    },
  ],
  inputs: [
    'character:latest',
    'character_evaluation:latest',
    'summary:latest',
    'memory:latest',
  ],
  languages: ['English'],
  timeZone: 'UTC',

  actions: ['transfer_item:latest', 'execute_gimmick:latest'],
  canvasActions: ['update_agent_canvas:latest', 'edit_agent_canvas:latest'],
  memoryActions: ['add_memory:latest', 'add_entity_memory:latest'],
  memoryPostActions: ['update_memory:latest', 'update_entity_memory:latest'],
  requiredActions: [],

  memoryLimit: 24,
  memoryLengthLimit: 250,
  entityMemoryLimit: 12,
  entityMemoryLengthLimit: 250,

  summaryLengthLimit: 2000,

  appearance: 'Typical human (but AI Agent)',
  character: {},

  rules: [],
};
