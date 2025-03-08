import { AgentCharacterInputBuilder } from './agent.character-input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('gba')
export class AgentGbaInputBuilder extends AgentCharacterInputBuilder {
  protected override buildPrefill(): string {
    const requiredActions = [
      ...this.agent.meta.requiredActions,
      ...this.location.meta.requiredActions,
    ];
    let requiredActionsPrefill;
    if (requiredActions.length > 0) {
      requiredActionsPrefill = ` In particular, I MUST use the following tools: ${requiredActions.join(', ')}.`;
    } else {
      requiredActionsPrefill = ``;
    }

    return `As ${this.agent.name}, I will now analyze the given Rules, Location, Messages, Memories, and Contexts to determine which tools to use and how to use them.${requiredActionsPrefill}
In particular, review the last play strategy and its outcome, then use that reflection to determine the next strategy.
Step 1:`;
  }
}
