import { Agent } from '../agent';

import { AgentCore } from './agent.core';

export class AgentEmptyCore extends AgentCore {
  public static readonly CORE_TYPE = 'empty';

  public constructor(agent: Agent) {
    super(agent);
  }

  public async update(): Promise<void> {}
}
