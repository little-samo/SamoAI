import { AgentId, EntityState } from '@little-samo/samo-ai';

export interface AgentMemory {
  memory: string;
  createdAt?: Date;
}

export interface AgentState extends EntityState {
  agentId: AgentId;
  memories: AgentMemory[];
  summary: string;
}
