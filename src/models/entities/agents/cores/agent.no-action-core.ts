import { AgentCore } from './agent.core';
import { RegisterAgentCore } from './agent.core-decorator';

import type { Agent } from '../agent';

@RegisterAgentCore('no_action')
export class AgentNoActionCore extends AgentCore {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async update(): Promise<boolean> {
    // Do nothing
    return false;
  }
}
