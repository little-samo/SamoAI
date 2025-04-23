import type { LlmMessage } from '@little-samo/samo-ai/common';

import { AgentCharacterInputBuilder } from './agent.character-input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('character_action_condition')
export class AgentCharacterActionConditionInputBuilder extends AgentCharacterInputBuilder {
  public override build(): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt();
    messages.push({
      role: 'system',
      content: prompt,
    });

    const userContents = this.buildContext();
    userContents.push({
      type: 'text',
      text: `
  Available tools: ${Object.keys(this.agent.actions).join(', ')}.
  
  Based on the rules, your character (${JSON.stringify(this.agent.meta.character)}), your goals, the current context, and recent messages (especially those from others), decide if you (${this.agent.name}) should take any action *in this turn*.
  
  Consider these factors:
  *   **Direct Triggers:** Is there a direct question, request, or event that requires an immediate response or reaction from you?
  *   **Proactive Opportunities:** Based on the conversation flow, your character's personality/goals, or changes in the environment (new entities, gimmick status), is there a relevant observation you should share, a question you should ask, or an action you should initiate?
  *   **Implicit Expectations:** Is it reasonably your turn to contribute to the conversation or activity?
  
  Based on the above factors, output your final decision ONLY as the literal string 'true' or 'false', with no surrounding text, markdown, or JSON formatting.
  `.trim(),
    });

    messages.push({
      role: 'user',
      content: AgentCharacterInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }
}
