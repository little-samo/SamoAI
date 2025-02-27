export const EntityType = {
  SYSTEM: 'system',
  AGENT: 'agent',
  USER: 'user',
  GIMMICK: 'gimmick',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export type EntityKey = string & { __entityKey: true };
export type EntityId = number & { __entityId: true };
