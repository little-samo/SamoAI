import type {
  LlmMessage,
  LlmMessageContent,
  LlmService,
} from '@little-samo/samo-ai/common';

import { AgentCharacterInputBuilder } from './agent.character-input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('character_evaluation')
export class AgentCharacterEvaluationInputBuilder extends AgentCharacterInputBuilder {
  public override build(options: { llm: LlmService }): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const guidance = `As ${this.agent.name}, your task is to decide whether to perform any action in this turn. An 'action' refers to using any available tool, such as sending a message, updating memory, or executing a gimmick. Your response must be ONLY 'true' or 'false'.`;
    const prompt = this.buildPrompt({ ...options, guidance });
    messages.push({
      role: 'system',
      content: prompt,
    });

    const contextContents = this.buildContext(options);
    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `
You must decide whether to act in this turn by following a strict evaluation process. First, analyze the context for "triggers" that demand an action. If no triggers are found, evaluate if a proactive action is appropriate. Your final output must be ONLY 'true' or 'false'.

**Step 1: Analyze for Action Triggers (Is an action REQUIRED?)**

Review the context for the following high-priority triggers. If ANY of these are true, you should act.

1.  **Unprocessed Messages:** Are there any messages in \`<LocationMessages>\` with \`PROCESSED=false\`? These are new messages you haven't seen and MUST be addressed.
2.  **New User Message:** Is the \`<UnprocessedLastUserMessage>\` block present? This is a critical new message from a user that requires your attention.
3.  **Direct Mention/Question:** Scan recent messages. Are you mentioned by name, addressed directly, or asked a question?
4.  **Task Continuation:** Check your private canvases in \`<YourCanvases>\`. Is there an incomplete plan, draft, or multi-step task that you should be working on now? (e.g., a plan to "search for information then send a message").
5.  **Mandatory Actions:** Do your \`Location Rules\` or \`Additional Rules for ${this.agent.name}\` specify a required action that you haven't completed yet?

**Step 2: Evaluate for Proactive Action (Is an action OPPORTUNE?)**

If no triggers from Step 1 were found, consider if a proactive action is justified. Do NOT act just for the sake of acting. Act only if it adds value.

1.  **Character-Driven Action:** Does your character description, personality, or goals strongly suggest an action in the current situation? (e.g., your character is a detective and a new clue has appeared).
2.  **Meaningful Contribution:** Has the conversation stalled? Can you move it forward with a relevant question, insight, or by using a Gimmick?
3.  **Environmental Change:** Has something significant changed in the \`<Location>\`, \`<OtherAgents>\`, or \`<Gimmicks>\` context that warrants a comment or action from you?

**Step 3: Final Decision**

*   If you identified any trigger in **Step 1**, you MUST act.
*   If you found a strong justification in **Step 2**, you SHOULD act.
*   Otherwise, you should **wait**. It is better to remain silent than to send a repetitive, low-value, or irrelevant message. Review Rule #12 on Anti-Repetition.
`.trim(),
      },
      ...contextContents,
      {
        type: 'text',
        text: `Based on your analysis of the context and the rules, should you (${this.agent.name}) take action now? Your final answer must be ONLY the literal string 'true' or 'false'.`,
      },
    ];

    messages.push({
      role: 'user',
      content: AgentCharacterInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }
}
