import { Agent } from '../agent';

import { AgentCore } from './agent.core';

export class AgentCoreFactory {
  public static readonly CORE_MAP: Record<
    string,
    new (agent: Agent) => AgentCore
  > = {};

  public static createCore(agent: Agent): AgentCore {
    const CoreClass = this.CORE_MAP[agent.meta.core];
    if (!CoreClass) {
      throw new Error(`Unknown agent core: ${agent.meta.core}`);
    }
    return new CoreClass(agent);
  }
}
