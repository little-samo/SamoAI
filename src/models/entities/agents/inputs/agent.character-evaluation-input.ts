import type {
  LlmMessage,
  LlmMessageContent,
} from '@little-samo/samo-ai/common';

import { AgentCharacterInputBuilder } from './agent.character-input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('character_evaluation')
export class AgentCharacterEvaluationInputBuilder extends AgentCharacterInputBuilder {
  public override build(): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const guidance = `Based on your character, goals, and the provided context, you will decide whether an action is needed in the current turn by outputting only 'true' or 'false'.`;
    const prompt = this.buildPrompt({ guidance });
    messages.push({
      role: 'system',
      content: prompt,
    });

    const contextContents = this.buildContext();
    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `
Based on the rules, your character, your goals, the current context, and recent messages (especially those from others), decide if you (${this.agent.name}) should take any action *in this turn*.
  
Consider these factors:
*   **Task Continuity & Obligations:** Review your rules and obligations. Also, check your private canvases (<YourCanvases>) for any ongoing plans, multi-step tasks, or unfinished drafts. If a task is incomplete or an obligation is unmet, you should generally act to continue it unless interrupted by a higher-priority trigger (like a direct question to you).
*   **Direct Triggers:** Is there a direct question, request, or event that requires an immediate response or reaction from you?
*   **Proactive Opportunities:** Based on the conversation flow, your character's personality/goals, or changes in the environment (new entities, gimmick status), is there a relevant observation you should share, a question you should ask, or an action you should initiate?
*   **Implicit Expectations:** Is it reasonably your turn to contribute to the conversation or activity?
  
Weigh these factors carefully. Your goal is to be a helpful and proactive participant. This means continuing your tasks and contributing when appropriate, but also knowing when to wait for others or for a better opportunity. Do not act if there is no clear reason to do so.
  
Based on the above factors, output your final decision ONLY as the literal string 'true' or 'false', with no surrounding text, markdown, or JSON formatting.
`.trim(),
      },
      ...contextContents,
    ];

    messages.push({
      role: 'user',
      content: AgentCharacterInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }
}
