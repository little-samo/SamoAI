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
You are a summary management system for "${this.agent.name}". Your role is to generate an updated, concise summary in English that maintains context and continuity across multiple locations.

The agent operates across multiple distinct locations where information is NOT automatically shared. This summary is crucial for maintaining context when switching between locations.
`);

    const rules: string[] = [];

    rules.push(
      `1. **Length Limit:** Must not exceed ${this.agent.meta.summaryLengthLimit} characters. Prioritize current turn's key events and recent vital points from previous summary.`,
      `2. **Synthesize & Condense:** Create coherent narrative integrating most relevant points from <CurrentSummary> with significant events from <Input> and <Output>.`,
      `3. **Priority Content:** Focus on ongoing situation, user intentions, relationships, unresolved tasks, and key interactions vital for when agent revisits this location after being elsewhere.`,
      `4. **State Changes:** Mention critical changes (users entering/leaving, item transfers, memory/canvas updates) with location prefix. Format: "[Location Name] Event description (timestamp)".`,
      `5. **Entity Format:** Use simple names for entities and locations. Include timestamps where available. Report objectively without interpretations.`,
      `6. **Language:** ALL summary content MUST be in English.`,
      `7. **Output Format:** Provide ONLY the raw summary text. No introductions, explanations, or markdown formatting.`
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
Generate the new summary following the rules above.

Key reminders:
- Max ${this.agent.meta.summaryLengthLimit} characters
- Must be in English
- Raw text only (no markdown or introductions)
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
