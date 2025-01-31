import { Agent } from '../agent';
import { AgentOutput } from '../io/agent.output';

import { AgentCore } from './agent.core';

export class AgentDmCore extends AgentCore {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async generateMessage(): Promise<AgentOutput> {
    // TODO
    throw new Error('Method not implemented');
  }
}
