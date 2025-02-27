import { AgentCore } from './agent.core';
import { RegisterAgentCore } from './agent.core-decorator';

@RegisterAgentCore('evaluate_and_actions')
export class AgentEvaluateAndActionsCore extends AgentCore {
  public async update(): Promise<boolean> {
    if (await this.agent.evaluateActionCondition()) {
      await this.agent.executeNextActions();
      return true;
    }
    return false;
  }
}
