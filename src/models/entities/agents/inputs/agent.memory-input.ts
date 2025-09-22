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
  public override build(options: {
    llm: LlmService;
    inputMessages: LlmMessage[];
    toolCalls: LlmToolCall[];
  }): LlmMessage[] {
    const { inputMessages, toolCalls } = options;
    const messages: LlmMessage[] = [];

    messages.push({
      role: 'system',
      content: `
**Objective:** Based on the agent's recent interaction, decide which memory updates are necessary using the \`update_memory\` and \`update_entity_memory\` tools.

**Context:**
*   \`<Prompt>\`: System prompt defining the agent's role and behavior.
*   \`<Input>\`: Context the agent received (including current memory state *before* this update).
*   \`<Output>\`: Agent's actions, including \`add_memory\` and \`add_entity_memory\` suggestions.

**Memory Update Rules:**

**Analysis Phase:**
1.  **Review Suggestions:** Examine all \`add_memory\` and \`add_entity_memory\` calls in \`<Output>\` based on the agent's intent and context.
2.  **Evaluate Necessity:** Determine if suggested information is truly important, new, or corrective compared to existing memories in \`<Input>\`. Avoid redundant entries.
3.  **Validate Existing Memories:** Review existing memories in \`<Input>\`. If any are clearly outdated or invalidated by current context, plan to update or clear them.

**Execution Phase:**
4.  **Prioritize Updates:** For multiple updates, prioritize the most critical ones based on agent's intent. Consolidate related information when appropriate.
5.  **Execute Memory Updates:** Use appropriate tools with proper slot selection:
    *   **General memories** (\`update_memory\`): Use first available slot (0-${this.agent.meta.memoryLimit - 1}). If full, justify which existing memory to overwrite.
    *   **Entity memories** (\`update_entity_memory\`): Use first available slot per entity (0-${this.agent.meta.entityMemoryLimit - 1}). If full, justify which existing memory to overwrite.
    *   **Clear outdated memories**: Use empty string ("") as memory content.
    *   **Index validation**: Ensure indices are within valid range (0 to limit-1).
  `.trim(),
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
        text: `Analyze the agent's recent interaction to determine what memory updates are needed. Follow the analysis and execution phases outlined above.`,
      },
      ...contextContents,
      {
        type: 'text',
        text: `
Now, based on your analysis, use the 'update_memory' and/or 'update_entity_memory' tools to perform the necessary changes.

**Critical Reminders:**
*   **Justify overwrites** when slots are full and existing memories must be replaced
*   **Avoid redundancy** - only update with truly new or corrective information
*   **Use proper indices** (0-${this.agent.meta.memoryLimit - 1} for general, 0-${this.agent.meta.entityMemoryLimit - 1} for entity memories)
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
