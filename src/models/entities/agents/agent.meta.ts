import {
  LlmPlatform,
  LlmServiceOptions,
  LlmThinkingLevel,
  LlmOutputVerbosity,
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

export interface AgentInputOptions {
  [key: string]: unknown;
}

export interface AgentInputMeta {
  name: string;
  options?: AgentInputOptions;
}

export interface AgentMeta extends EntityMeta {
  core: string;
  prompts: AgentPrompts;

  temperature: number;
  maxTokens: number;
  maxThinkingTokens: number;
  thinkingLevel: LlmThinkingLevel;
  outputVerbosity: LlmOutputVerbosity;

  maxEvaluatationThinkingTokens: number;
  evaluationThinkingLevel: LlmThinkingLevel;
  evaluationOutputVerbosity: LlmOutputVerbosity;

  disableSummary?: boolean;
  maxSummaryThinkingTokens: number;
  summaryThinkingLevel: LlmThinkingLevel;
  summaryOutputVerbosity: LlmOutputVerbosity;

  disableMemory?: boolean;
  maxMemoryThinkingTokens: number;
  memoryThinkingLevel: LlmThinkingLevel;
  memoryOutputVerbosity: LlmOutputVerbosity;

  llms: AgentLlmMeta[];
  inputs: (string | AgentInputMeta)[];
  languages: string[];
  timeZone: string;
  greeting?: string;

  actions: string[];
  addActions?: string[];
  canvasActions: string[];
  memoryActions: string[];
  memoryPostActions: string[];
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
      role?: string; // Agent's role (professor, assistant, coach)
      gender?: string; // Gender
      expertise?: string; // Areas of expertise
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
      traits?: string | string[]; // Key personality traits (empathetic, analytical, creative)
      interests?: string | string[]; // Topics of interest
      values?: string | string[]; // Core values and beliefs
      quirks?: string | string[]; // Unique habits or characteristics
      mbti?: string; // MBTI personality type
      zodiac?: string; // Zodiac sign
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
  maxTokens: 4096,
  thinkingLevel: LlmThinkingLevel.low,
  maxThinkingTokens: 1024,
  outputVerbosity: LlmOutputVerbosity.low,

  maxEvaluatationThinkingTokens: 512,
  evaluationThinkingLevel: LlmThinkingLevel.minimal,
  evaluationOutputVerbosity: LlmOutputVerbosity.low,

  maxSummaryThinkingTokens: 512,
  summaryThinkingLevel: LlmThinkingLevel.minimal,
  summaryOutputVerbosity: LlmOutputVerbosity.low,

  maxMemoryThinkingTokens: 512,
  memoryThinkingLevel: LlmThinkingLevel.minimal,
  memoryOutputVerbosity: LlmOutputVerbosity.low,

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
  memoryLengthLimit: 500,
  entityMemoryLimit: 8,
  entityMemoryLengthLimit: 500,

  summaryLengthLimit: 2000,

  appearance: 'Typical human (but AI Agent)',
  character: {},

  rules: [],
};
