import { Agent } from '../agent.js';
import { AgentOutput } from '../io/agent.output.js';

import { AgentCore } from './agent.core.js';

export class AgentDmCore extends AgentCore {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async generateMessage(): Promise<AgentOutput> {
    // TODO
    throw new Error('Method not implemented');
  }
}
