import { AgentId, EntityId, EntityType } from '@little-samo/samo-ai';

export interface AgentEntityState {
  agentId: AgentId;
  targetType: EntityType;
  targetId: EntityId;

  memories: string[];

  updatedAt: Date;
  createdAt: Date;
}
