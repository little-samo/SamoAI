import { Agent } from '../agent';

export abstract class AgentCore {
  protected constructor(public readonly agent: Agent) {}

  public abstract update(): Promise<void>;
}
