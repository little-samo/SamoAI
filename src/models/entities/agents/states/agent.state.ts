import { AgentId, EntityState } from '@little-samo/samo-ai';

export interface AgentState extends EntityState {
  agentId: AgentId;
  memories: string[];
}
