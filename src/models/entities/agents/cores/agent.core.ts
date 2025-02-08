import { Agent } from '../agent';

import { AgentEmptyCore } from './agent.empty-core';

export abstract class AgentCore {
  protected constructor(public readonly agent: Agent) {}

  public static createCore(agent: Agent): AgentCore {
    switch (agent.meta.core) {
      case '':
      case 'empty':
        return new AgentEmptyCore(agent);
      default:
        throw new Error(`Unknown agent core: ${agent.meta.core}`);
    }
  }

  public abstract update(): Promise<void>;
}
