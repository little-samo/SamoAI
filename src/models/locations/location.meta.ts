import { AgentId, AgentMeta } from '../entities';

export interface LocationCoreMeta {
  name: string;
  sequential?: boolean;
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

  messageLimit: number;
  messageLengthLimit: number;
  agentMessageLengthLimit?: number;
  userContextLimit: number;
  agentUserContextLimit: number;

  actions: string[];
  requiredActions: string[];
  rules: string[];

  canvases: LocationCanvasMeta[];
  agentCanvases: LocationEntityCanvasMeta[];

  agentMetas: Record<AgentId, Partial<AgentMeta>>;
}

export const DEFAULT_LOCATION_META: LocationMeta = {
  core: 'update_once',
  description: '',
  imageDescriptions: [],

  messageLimit: 20,
  messageLengthLimit: 250,
  userContextLimit: 8,
  agentUserContextLimit: 4,
  actions: [
    'send_casual_message:latest',
    'update_canvas:latest',
    'update_agent_canvas:latest',
  ],
  requiredActions: [],
  rules: [],

  canvases: [],
  agentCanvases: [
    {
      name: 'plan',
      description:
        'For detailed, multi-step planning and long-term strategy development. Use this private space to outline goals, break down complex tasks into actionable steps, track progress towards objectives, list required resources or information, or draft sequences of actions before executing them via tools. Keep the plan organized and focused on achieving your objectives.',
      maxLength: 1000,
    },
  ],

  agentMetas: {},
};
