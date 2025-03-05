import { AgentId, EntityId, EntityType } from '@little-samo/samo-ai';

export interface AgentEntityMemory {
  memory: string;
  createdAt?: Date;
}

export interface AgentEntityState {
  agentId: AgentId;
  targetType: EntityType;
  targetId: EntityId;

  memories: AgentEntityMemory[];

  updatedAt: Date;
  createdAt: Date;
}
