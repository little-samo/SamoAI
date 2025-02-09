import { Agent } from '../agent';

import { AgentEmptyCore } from './agent.empty-core';

export abstract class AgentCore {
  public static readonly CORE_TYPE: string;

  public static CORE_MAP: Record<string, new (agent: Agent) => AgentCore> = {
    [AgentEmptyCore.CORE_TYPE]: AgentEmptyCore,
  };

  protected constructor(public readonly agent: Agent) {}

  public static createCore(agent: Agent): AgentCore {
    const CoreClass = this.CORE_MAP[agent.meta.core];
    if (!CoreClass) {
      throw new Error(`Unknown agent core: ${agent.meta.core}`);
    }
    return new CoreClass(agent);
  }

  public abstract update(): Promise<void>;
}
