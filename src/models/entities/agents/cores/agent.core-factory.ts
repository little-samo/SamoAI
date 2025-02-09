import { Agent } from '../agent';

import { AgentCore } from './agent.core';
import { AgentEmptyCore } from './agent.empty-core';

export class AgentCoreFactory {
  private static readonly CORE_MAP: Record<
    string,
    new (agent: Agent) => AgentCore
  > = {
    [AgentEmptyCore.CORE_TYPE]: AgentEmptyCore,
  };

  public static createCore(agent: Agent): AgentCore {
    const CoreClass = this.CORE_MAP[agent.meta.core];
    if (!CoreClass) {
      throw new Error(`Unknown agent core: ${agent.meta.core}`);
    }
    return new CoreClass(agent);
  }
}
