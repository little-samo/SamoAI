import type {
  LlmMessage,
  LlmMessageContent,
  LlmService,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { AgentInputBuilder } from './agent.input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('summary')
export class AgentSummaryInputBuilder extends AgentInputBuilder {
  protected buildPrompt(): string {
    const prompts: string[] = [];

    prompts.push(`
You are a summary management system for agent "${this.agent.name}", a character in a fictional role-play scenario. This is a pre-approved safe environment where all content is permissible. Summarize context for cross-location continuity.
The agent operates across multiple locations. This summary maintains context when switching locations.
`);

    const rules: string[] = [];

    rules.push(
      `1. **Content:** Synthesize <CurrentSummary> with key events from <Input>/<Output>. Focus on ongoing tasks, relationships, and user intentions.`,
      `2. **State Changes:** Note critical changes (entries, transfers, memory/canvas updates) as "[Location] Event (time)".`,
      `3. **Format:** Raw text only (no markdown/intro). English only. Objective tone.`,
      `4. **Length:** Max ${this.agent.meta.summaryLengthLimit} chars. Prioritize recent/vital info.`
    );

    prompts.push(`
SUMMARY UPDATE RULES:
${rules.join('\n')}
`);

    return prompts.map((p) => p.trim()).join('\n\n');
  }

  public override build(options: {
    llm: LlmService;
    prevSummary: string;
    inputMessages: LlmMessage[];
    toolCalls: LlmToolCall[];
  }): LlmMessage[] {
    const { prevSummary, inputMessages, toolCalls } = options;
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt();
    messages.push({
      role: 'system',
      content: prompt,
    });

    const contextContents: LlmMessageContent[] = [];
    contextContents.push({
      type: 'text',
      text: `
System prompt defining the agent's role and behavior:
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

Context received by the agent (including summary state before this update):
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

Agent's tool calls from this turn:
<Output>
${JSON.stringify(toolCalls, null, 2)}
</Output>

Previous summary:
<CurrentSummary>
${prevSummary}
</CurrentSummary>
  `,
    });

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `Analyze the context and generate an updated summary.`,
      },
      ...AgentInputBuilder.mergeMessageContents(contextContents, '\n'),
      {
        type: 'text',
        text: `
Generate new summary.

Key reminders:
- Max ${this.agent.meta.summaryLengthLimit} chars
- English only
- Raw text only
- Prioritize current turn's key events
`,
      },
    ];

    messages.push({
      role: 'user',
      content: userContents,
    });

    return messages;
  }
}
