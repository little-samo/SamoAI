import { AgentEntityState } from '@little-samo/samo-ai/models/entities/agents/states/agent.entity-state';
import { AgentState } from '@little-samo/samo-ai/models/entities/agents/states/agent.state';
import {
  AgentId,
  EntityType,
  UserId,
} from '@little-samo/samo-ai/models/entities/entity.types';
import { EntityId } from '@little-samo/samo-ai/models/entities/entity.types';
import { AgentModel } from '@prisma/client';

export interface AgentsRepository {
  getAgentModel(agentId: AgentId): Promise<AgentModel>;
  getAgentModels(agentIds: AgentId[]): Promise<Record<AgentId, AgentModel>>;
  getAgentState(agentId: AgentId): Promise<null | AgentState>;
  getAgentStates(agentIds: AgentId[]): Promise<Record<AgentId, AgentState>>;
  getAgentEntityState(
    agentId: AgentId,
    type: EntityType,
    id: EntityId
  ): Promise<null | AgentEntityState>;
  getAgentEntityStates(
    agentIds: AgentId[],
    targetAgentIds: AgentId[],
    targetUserIds: UserId[]
  ): Promise<Record<AgentId, AgentEntityState[]>>;

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
