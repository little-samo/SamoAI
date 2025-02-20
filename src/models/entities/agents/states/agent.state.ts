import { EntityState } from '@little-samo/samo-ai/models/entities/entity.state';
import { AgentId } from '@little-samo/samo-ai/models/entities/entity.types';

export interface AgentState extends EntityState {
  agentId: AgentId;
  memories: string[];
}
