export interface LocationMeta {
  core: string;
  description: string;

  messageLimit: number;
  messageLengthLimit: number;
  actions: string[];
  requiredActions: string[];
}

export const DEFAULT_LOCATION_META: LocationMeta = {
  core: 'repeat_action',
  description: '',

  messageLimit: 25,
  messageLengthLimit: 250,
  actions: [],
  requiredActions: [],
};
