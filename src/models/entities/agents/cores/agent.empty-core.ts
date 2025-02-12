import { Agent } from '../agent';

import { RegisterAgentCore } from './agent.core-decorator';
import { AgentCore } from './agent.core';

@RegisterAgentCore('empty')
export class AgentEmptyCore extends AgentCore {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async update(): Promise<void> {}
}
