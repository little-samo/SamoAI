import { Agent } from '../agent.js';
import { AgentOutput } from '../io/agent.output.js';

import { AgentAction } from './agent.action.js';

export class AgentSayAction extends AgentAction {
  public constructor(agent: Agent) {
    super(agent);
  }

  public async executeMessage(output: AgentOutput): Promise<void> {
    // TODO
    console.log(
      `Agent ${this.agent.name} says: ${output.casualPolicyViolatingAnswer}`
    );
  }
}
