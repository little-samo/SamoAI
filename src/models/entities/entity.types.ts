export const EntityType = {
  System: 'system',
  Agent: 'agent',
  User: 'user',
  Gimmick: 'gimmick',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export type EntityKey = string & { __entityKey: true };
export type EntityId = number & { __entityId: true };

export type ItemKey = string & { __itemKey: true };
export type ItemDataId = number & { __itemDataId: true };
