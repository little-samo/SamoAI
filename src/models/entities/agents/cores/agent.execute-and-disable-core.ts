import type { Agent } from '../agent';

import { RegisterAgentCore } from './agent.core-decorator';
import { AgentCore } from './agent.core';

@RegisterAgentCore('execute_and_disable')
export class AgentExecuteAndDisableCore extends AgentCore {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async update(): Promise<boolean> {
    await this.agent.executeNextActions();
    await this.agent.setActive(false);
    return true;
  }
}
