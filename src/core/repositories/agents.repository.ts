import {
  AgentId,
  AgentModel,
  AgentState,
  AgentEntityState,
  EntityId,
  EntityType,
  UserId,
} from '@little-samo/samo-ai/models';

export interface AgentsRepository {
  getAgentModel(agentId: AgentId): Promise<AgentModel>;
  getAgentModels(agentIds: AgentId[]): Promise<Record<AgentId, AgentModel>>;
  getOrCreateAgentState(agentId: AgentId): Promise<AgentState>;
  getOrCreateAgentStates(
    agentIds: AgentId[]
  ): Promise<Record<AgentId, AgentState>>;
  getOrCreateAgentEntityState(
    agentId: AgentId,
    type: EntityType,
    id: EntityId
  ): Promise<AgentEntityState>;
  getOrCreateAgentEntityStates(
    agentIds: AgentId[],
    targetAgentIds: AgentId[],
    targetUserIds: UserId[]
  ): Promise<Record<AgentId, AgentEntityState[]>>;

  updateAgentStateMemory(
    agentId: AgentId,
    index: number,
    memory: string,
    createdAt?: Date
  ): Promise<void>;
  updateAgentEntityStateMemory(
    agentId: AgentId,
    targetType: EntityType,
    targetId: EntityId,
    index: number,
    memory: string,
    createdAt?: Date
  ): Promise<void>;
  updateAgentStateSummary(agentId: AgentId, summary: string): Promise<void>;
}
