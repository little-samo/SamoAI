export interface LocationMeta {
  core: string;
  description: string;

  messageLimit: number;
  messageLengthLimit: number;
  actions: string[];
  requiredActions: string[];
  rules: string[];
}

export const DEFAULT_LOCATION_META: LocationMeta = {
  core: 'repeat_action',
  description: '',

  messageLimit: 20,
  messageLengthLimit: 250,
  actions: ['send_casual_message:latest'],
  requiredActions: ['send_casual_message:latest'],
  rules: [],
};
