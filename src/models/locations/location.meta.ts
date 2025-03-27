export interface LocationMeta {
  core: string;
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
}

export const DEFAULT_LOCATION_META: LocationMeta = {
  core: 'update_once',
  description: '',
  imageDescriptions: [],

  messageLimit: 20,
  messageLengthLimit: 250,
  userContextLimit: 8,
  agentUserContextLimit: 4,
  actions: ['send_casual_message:latest'],
  requiredActions: [],
  rules: [],
};
