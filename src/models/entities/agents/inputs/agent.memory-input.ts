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
You are a memory management system for "${this.agent.name}". Your role is to analyze the agent's recent interaction and determine which memory updates are necessary.
`);

    const rules: string[] = [];

    // Analysis rules
    rules.push(
      `1. **Review Suggestions:** Examine all \`add_memory\` and \`add_entity_memory\` calls in <Output> based on the agent's intent and context in <Input>.`,
      `2. **Evaluate Necessity:** Only update if information is truly important, new, or corrective compared to existing memories. Avoid redundant entries.`,
      `3. **Validate Existing:** Review existing memories. Clear outdated or invalidated entries by using empty string ("") as memory content.`
    );

    // Execution rules
    rules.push(
      `4. **Prioritize Updates:** For multiple updates, prioritize the most critical. Consolidate related information when appropriate.`,
      `5. **General Memories:** Use \`update_memory\` with indices 0-${this.agent.meta.memoryLimit - 1}. Use first available slot. If full, overwrite least important.`,
      `6. **Entity Memories:** Use \`update_entity_memory\` with indices 0-${this.agent.meta.entityMemoryLimit - 1} per entity. Use first available slot. If full, overwrite least important for that entity.`,
      `7. **Entity Key Format:** CRITICAL - Entity keys are in format "type:id" where id is a NUMBER. Examples: "user:123", "agent:456". NEVER use format like "user:@name" or "agent:@name". Extract the correct numeric id from context.`,
      `8. **Clear Outdated:** To delete/clear a memory slot, use empty string ("") as the memory value.`,
      `9. **Language:** ALL memory content MUST be written in English, even when summarizing non-English information.`
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
Based on your analysis, use \`update_memory\` and/or \`update_entity_memory\` to perform necessary changes.

Key reminders:
- Use correct entity key format: "type:id" with NUMERIC id (e.g., "user:123" NOT "user:@name")
- Justify overwrites when slots are full
- Avoid redundancy - only truly new/corrective information
- Use proper indices: 0-${this.agent.meta.memoryLimit - 1} (general), 0-${this.agent.meta.entityMemoryLimit - 1} (entity)
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
