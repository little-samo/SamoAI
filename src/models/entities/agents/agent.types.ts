import { EntityId } from '../entity.types';

export type AgentId = EntityId & { __agentId: true };
