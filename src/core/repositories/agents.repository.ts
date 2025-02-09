import { AgentEntityState } from '@models/entities/agents/states/agent.entity-state';
import { AgentState } from '@models/entities/agents/states/agent.state';
import { AgentModel } from '@prisma/client';

export interface AgentsRepository {
  getAgentModel(agentId: number): Promise<AgentModel>;
  getAgentModels(agentIds: number[]): Promise<Record<number, AgentModel>>;
  getAgentState(agentId: number): Promise<null | AgentState>;
  getAgentStates(agentIds: number[]): Promise<Record<number, AgentState>>;
  getAgentEntityState(
    agentId: number,
    targetAgentId?: number,
    targetUserId?: number
  ): Promise<null | AgentEntityState>;
  getAgentEntityStates(
    agentIds: number[],
    targetAgentIds: (number | null)[],
    targetUserIds: (number | null)[]
  ): Promise<Record<number, AgentEntityState[]>>;

  saveAgentModel(model: AgentModel): Promise<void>;
  saveAgentState(state: AgentState): Promise<void>;
  saveAgentStates(states: AgentState[]): Promise<void>;
  saveAgentEntityState(state: AgentEntityState): Promise<void>;
  saveAgentEntityStates(states: AgentEntityState[]): Promise<void>;
}
