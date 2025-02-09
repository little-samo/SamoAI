import { AgentEntityState } from '@models/entities/agents/states/agent.entity-state';
import { AgentState } from '@models/entities/agents/states/agent.state';
import { AgentModel } from '@prisma/client';

export interface AgentsRepository {
  getAgentModel(agentId: number): Promise<AgentModel>;
  getAgentState(agentId: number): Promise<null | AgentState>;
  getAgentEntityState(
    agentId: number,
    targetAgentId?: number,
    targetUserId?: number
  ): Promise<null | AgentEntityState>;

  saveAgentModel(model: AgentModel): Promise<void>;
  saveAgentState(state: AgentState): Promise<void>;
  saveAgentEntityState(state: AgentEntityState): Promise<void>;
}
