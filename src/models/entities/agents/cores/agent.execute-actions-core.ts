import { Agent } from '../agent';

import { RegisterAgentCore } from './agent.core-decorator';
import { AgentCore } from './agent.core';

@RegisterAgentCore('execute_actions')
export class AgentExecuteActionsCore extends AgentCore {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async update(): Promise<boolean> {
    await this.agent.executeNextActions();
    return true;
  }
}
