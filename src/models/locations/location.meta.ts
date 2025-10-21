import { AgentMeta, GimmickMeta } from '../entities';

export interface LocationCoreMeta {
  name: string;
  sequential?: boolean;
  interval?: number;
  fast?: boolean;
  maxAgentExecutions?: number | null;
}

export interface LocationPrompts {
  [key: string]: string | undefined;
}

export interface LocationCanvasMeta {
  name: string;
  description: string;
  maxLength: number;
}

export interface LocationEntityCanvasMeta {
  name: string;
  description: string;
  maxLength: number;
}

export interface LocationMeta {
  core: string | LocationCoreMeta;
  description: string;
  imageDescriptions: string[];
  renderingDescription?: string;
  prompts: LocationPrompts;

  messageLimit: number;
  messageLengthLimit: number;
  agentMessageLengthLimit?: number;
  userContextLimit: number;
  agentAgentContextLimit: number;
  agentUserContextLimit: number;

  actions: string[];
  addActions?: string[];
  messageAction: string;
  canvasActions?: string[];
  requiredActions: string[];
  rules: string[];

  canvases: LocationCanvasMeta[];
  agentCanvases: LocationEntityCanvasMeta[];

  agentMetas: Record<string, Partial<AgentMeta>>;

  gimmicks: Record<string, GimmickMeta>;
}

export const DEFAULT_LOCATION_META: LocationMeta = {
  core: 'update_once',
  description: '',
  imageDescriptions: [],
  prompts: {},

  messageLimit: 30,
  messageLengthLimit: 800,
  userContextLimit: 8,
  agentAgentContextLimit: 4,
  agentUserContextLimit: 4,
  actions: [],
  messageAction: 'send_message:latest',
  canvasActions: ['update_canvas:latest', 'edit_canvas:latest'],
  requiredActions: [],
  rules: [],

  canvases: [],
  agentCanvases: [
    {
      name: 'plan',
      description:
        'Your private workspace for strategic thinking and task management. **Use this canvas CONSISTENTLY for any task requiring multiple steps, long-term tracking, or persistent information.** Break down complex goals into actionable steps (Plan-Do-Check-Act cycle recommended: 1. Outline steps, 2. Execute first step(s), 3. Check progress/results, 4. Adjust plan). Draft sequences of actions, list required resources, track progress, and refine strategies here before using tools. Keep it updated and organized to ensure effective execution.',
      maxLength: 1000,
    },
  ],

  agentMetas: {},

  gimmicks: {},
};
