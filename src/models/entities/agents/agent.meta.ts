import {
  LlmPlatform,
  LlmServiceOptions,
  LlmThinkingLevel,
  LlmOutputVerbosity,
  LlmMediaResolution,
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
  mediaResolution?: LlmMediaResolution;
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

  llms: (AgentLlmMeta | null)[];
  inputs: (string | AgentInputMeta)[];
  languages: string[];
  timeZone: string;
  greeting?: string;

  actions: string[];
  addActions?: string[];
  canvasActions: string[];
  itemActions: string[];
  missionActions: string[];
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
      gender?: string; // Agent's gender identity
      age?: string; // Agent's age
      expertise?: string; // Areas of specialized knowledge
      backstory?: string; // Agent's history and past experiences
      [key: string]: undefined | string; // Additional background properties
    };

    // Communication style
    speech?: {
      tone?: string; // Emotional quality (e.g., warm, serious, playful)
      style?: string; // Expression style (e.g., concise, verbose, poetic)
      formality?: string; // Language formality level (e.g., casual, professional, formal)
      [key: string]: undefined | string; // Additional speech properties
    };

    // Personality aspects
    personality?: {
      traits?: string; // Defining characteristics
      interests?: string; // Topics and activities the agent enjoys
      values?: string; // Core principles guiding behavior
      quirks?: string; // Unique habits or mannerisms
      mbti?: string; // MBTI personality type
      zodiac?: string; // Zodiac sign
      [key: string]: undefined | string; // Additional personality properties
    };

    // Additional characteristics
    [key: string]:
      | undefined
      | string
      | {
          [key: string]: undefined | string; // Additional properties
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
      model: 'gemini-3-flash-preview',
      thinking: true,
    },
    {
      platform: LlmPlatform.GEMINI,
      model: 'gemini-2.5-flash-lite-preview-09-2025',
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

  actions: ['execute_gimmick:latest'],
  canvasActions: ['update_agent_canvas:latest', 'edit_agent_canvas:latest'],
  itemActions: ['transfer_item:latest'],
  missionActions: ['set_mission:latest', 'complete_objective:latest'],
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
