import {
  AgentId,
  AgentModel,
  AgentState,
  AgentEntityState,
  EntityId,
  EntityType,
  UserId,
} from '@little-samo/samo-ai/models';

export interface AgentRepository {
  getAgentModel(agentId: AgentId): Promise<AgentModel>;
  getAgentModels(agentIds: AgentId[]): Promise<Map<AgentId, AgentModel>>;
  getOrCreateAgentState(agentId: AgentId): Promise<AgentState>;
  getOrCreateAgentStates(
    agentIds: AgentId[]
  ): Promise<Map<AgentId, AgentState>>;
  getOrCreateAgentEntityState(
    agentId: AgentId,
    type: EntityType,
    id: EntityId
  ): Promise<AgentEntityState>;
  getOrCreateAgentEntityStates(
    agentIds: AgentId[],
    targetAgentIds: AgentId[],
    targetUserIds: UserId[]
  ): Promise<Map<AgentId, AgentEntityState[]>>;

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
