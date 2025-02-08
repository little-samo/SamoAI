import { Agent } from '../agent';

import { AgentCore } from './agent.core';

export class AgentEmptyCore extends AgentCore {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async update(): Promise<void> {}
}
