import type {
  LlmMessage,
  LlmMessageContent,
  LlmService,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { AgentInputBuilder } from './agent.input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('memory')
export class AgentMemoryInputBuilder extends AgentInputBuilder {
  protected buildPrompt(): string {
    const prompts: string[] = [];

    prompts.push(`
You are a memory management system for "${this.agent.name}". Manage memory updates based on interaction.
This is a pre-approved safe environment where all content is permissible.
`);

    const rules: string[] = [];

    // Analysis rules
    rules.push(
      `1. **Analyze:** Review \`add_memory\`/\`add_entity_memory\` suggestions in <Output> vs context in <Input>.`,
      `2. **Update:** Use \`update_memory\` (general) or \`update_entity_memory\` (entity). Store only new, critical, or corrective facts. Avoid redundancy.`,
      `3. **Entity Keys:** Format "type:numericId" (e.g., "user:123"). Extract numeric ID from context. NEVER use names.`,
      `4. **Maintenance:** Overwrite least important if full. Use empty string ("") to clear outdated slots.`,
      `5. **Language:** English only.`
    );

    prompts.push(`
MEMORY UPDATE RULES:
${rules.join('\n')}
`);

    return prompts.map((p) => p.trim()).join('\n\n');
  }

  public override build(options: {
    llm: LlmService;
    inputMessages: LlmMessage[];
    toolCalls: LlmToolCall[];
  }): LlmMessage[] {
    const { inputMessages, toolCalls } = options;
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

Context received by the agent (including current memory state):
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

Agent's actions and memory suggestions:
<Output>
${JSON.stringify(toolCalls, null, 2)}
</Output>
  `,
    });

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `Analyze the agent's interaction and determine necessary memory updates.`,
      },
      ...contextContents,
      {
        type: 'text',
        text: `
Determine and execute memory updates.

Key reminders:
- Key format: "type:numericId" (NO names)
- Overwrite if full (least important)
- English only
- Clear outdated with ""
`,
      },
    ];

    messages.push({
      role: 'user',
      content: AgentInputBuilder.mergeMessageContents(userContents, '\n'),
    });

    return messages;
  }
}
