import { AgentEntityState } from '@models/entities/agents/states/agent.entity-state';
import { AgentState } from '@models/entities/agents/states/agent.state';
import { AgentId, EntityType, UserId } from '@models/entities/entity.types';
import { EntityId } from '@models/entities/entity.types';
import { AgentModel } from '@prisma/client';

export interface AgentsRepository {
  getAgentModel(agentId: number): Promise<AgentModel>;
  getAgentModels(agentIds: number[]): Promise<Record<number, AgentModel>>;
  getAgentState(agentId: number): Promise<null | AgentState>;
  getAgentStates(agentIds: number[]): Promise<Record<number, AgentState>>;
  getAgentEntityState(
    agentId: AgentId,
    type: EntityType,
    id: EntityId
  ): Promise<null | AgentEntityState>;
  getAgentEntityStates(
    agentIds: AgentId[],
    targetAgentIds: AgentId[],
    targetUserIds: UserId[]
  ): Promise<Record<number, AgentEntityState[]>>;

  saveAgentModel(model: AgentModel): Promise<AgentModel>;
  saveAgentState(state: AgentState): Promise<void>;
  saveAgentStateMemory(
    state: AgentState,
    index: number,
    memory: string
  ): Promise<void>;
  saveAgentEntityState(state: AgentEntityState): Promise<void>;
  saveAgentEntityStateMemory(
    state: AgentEntityState,
    index: number,
    memory: string
  ): Promise<void>;
}
