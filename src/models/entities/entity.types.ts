export type EntityType = AgentType | UserType;
export type EntityKey = string & { __entityKey: true };
export type EntityId = number & { __entityId: true };

export type AgentType = 'agent';
export type AgentId = EntityId & { __agentId: true };

export type UserType = 'user';
export type UserId = EntityId & { __userId: true };
