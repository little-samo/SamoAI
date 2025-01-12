import { Agent } from '../agent.js';
import { AgentOutput } from '../io/agent.output.js';

import { AgentSayAction } from './agent.say-action.js';

export abstract class AgentAction {
  protected constructor(public readonly agent: Agent) {}

  public static createAction(agent: Agent): AgentAction {
    switch (agent.model.name) {
      case 'SAY':
        return new AgentSayAction(agent);
      default:
        throw new Error(`Unknown agent action: ${agent.model.name}`);
    }
  }

  public abstract executeMessage(output: AgentOutput): Promise<void>;
}
