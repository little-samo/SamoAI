import { Agent } from '../agent.js';
import { AgentOutput } from '../io/agent.output.js';

import { AgentDmCore } from './agent.dm-core.js';

export abstract class AgentCore {
  protected constructor(public readonly agent: Agent) {}

  public static createCore(agent: Agent): AgentCore {
    switch (agent.model.core) {
      case 'dm':
        return new AgentDmCore(agent);
      default:
        throw new Error(`Unknown agent core: ${agent.model.core}`);
    }
  }

  public abstract generateMessage(): Promise<AgentOutput>;
}
