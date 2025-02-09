import { Agent } from '../agent';

export abstract class AgentCore {
  public static readonly CORE_TYPE: string;

  protected constructor(public readonly agent: Agent) {}

  public abstract update(): Promise<void>;
}
