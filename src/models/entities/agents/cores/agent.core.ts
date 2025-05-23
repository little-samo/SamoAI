import { AGENT_CORE_METADATA_KEY } from './agent.core-constants';

import type { Agent } from '../agent';

export abstract class AgentCore {
  protected constructor(public readonly agent: Agent) {}

  public get name(): string {
    return Reflect.getMetadata(AGENT_CORE_METADATA_KEY, this.constructor);
  }

  public abstract update(): Promise<boolean>;
}
