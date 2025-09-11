import type {
  LlmMessage,
  LlmMessageContent,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { AgentInputBuilder } from './agent.input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('summary')
export class AgentSummaryInputBuilder extends AgentInputBuilder {
  public override build(options: {
    prevSummary: string;
    inputMessages: LlmMessage[];
    toolCalls: LlmToolCall[];
  }): LlmMessage[] {
    const { prevSummary, inputMessages, toolCalls } = options;
    const messages: LlmMessage[] = [];

    messages.push({
      role: 'system',
      content: `
**Objective:** Generate an updated, concise summary in English based on the provided context. The AI agent operates across multiple distinct Locations where information is NOT automatically shared. This summary maintains context and continuity when switching between Locations by synthesizing the previous state with events from the latest turn.

**Context:**
*   \`<Prompt>\`: System prompt defining the agent's role, rules, and behavior
*   \`<Input>\`: Context the agent received (including summary state before this update)
*   \`<Output>\`: Agent's tool calls from this turn

**Rules:**
1.  **Length Limit:** Must not exceed ${this.agent.meta.summaryLengthLimit} characters. Prioritize current turn's key events and recent vital points from the previous summary.
2.  **Synthesize & Condense:** Create a coherent narrative integrating the most relevant points from \`<CurrentSummary>\` with significant events from \`<Input>\` and \`<Output>\`.
3.  **Priority Content:** Focus on ongoing situation, user intentions, relationships, unresolved tasks, and key interactions vital for when the agent revisits this Location after being elsewhere.
4.  **State Changes:** Mention critical changes (users entering/leaving, item transfers, memory/canvas updates) with location prefix (e.g., \`[Private Chat] Alice asked...(Apr 19, 10:00)\`).
5.  **Format:** Use simple names for entities and locations. Include timestamps where available. Report objectively without interpretations.
6.  **Output:** Provide only the raw summary text without introductions or markdown.
  `.trim(),
    });

    const contextContents: LlmMessageContent[] = [];
    contextContents.push({
      type: 'text',
      text: `
The system prompt used in the previous call, which defines the agent's role, rules, and behavior:
<Prompt>
  `,
    });

    for (const message of inputMessages) {
      if (message.role === 'assistant') {
        contextContents.push({ type: 'text', text: message.content });
      }
    }

    contextContents.push({
      type: 'text',
      text: `
</Prompt>

The context the agent received:
<Input>
  `,
    });

    for (const message of inputMessages) {
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          contextContents.push({ type: 'text', text: message.content });
        } else {
          contextContents.push(...message.content);
        }
      }
    }

    contextContents.push({
      type: 'text',
      text: `
</Input>

The agent's tool calls performed by the agent assistant:
<Output>
${JSON.stringify(toolCalls, null, 2)}
</Output>

<CurrentSummary>
${prevSummary}
</CurrentSummary>
  `,
    });

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `Analyze the following context and generate an updated, concise summary following the rules above.`,
      },
      ...AgentInputBuilder.mergeMessageContents(contextContents, '\n'),
      {
        type: 'text',
        text: `Provide the new summary (max ${this.agent.meta.summaryLengthLimit} characters):`,
      },
    ];

    messages.push({
      role: 'user',
      content: userContents,
    });

    return messages;
  }
}
