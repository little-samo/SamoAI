import { Agent } from '../agent';
import { AgentOutput } from '../io/agent.output';

import { AgentAction } from './agent.action';

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
