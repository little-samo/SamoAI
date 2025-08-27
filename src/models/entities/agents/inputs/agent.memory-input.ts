import type {
  LlmMessage,
  LlmMessageContent,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { AgentInputBuilder } from './agent.input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('memory')
export class AgentMemoryInputBuilder extends AgentInputBuilder {
  public override build(options: {
    inputMessages: LlmMessage[];
    toolCalls: LlmToolCall[];
  }): LlmMessage[] {
    const { inputMessages, toolCalls } = options;
    const messages: LlmMessage[] = [];

    messages.push({
      role: 'system',
      content: `
**Objective:** Based on the agent's recent interaction (input, output including \`add_memory\` and \`add_entity_memory\` suggestions), decide which actual memory updates are necessary using the \`update_memory\` and \`update_entity_memory\` tools.

**Context:**
*   \`<Prompt>\` (in user message): Contains the system prompt used in the previous call, which defines the agent's role, rules, and behavior.
*   \`<Input>\`: Shows the context the agent received (including current memory state *before* this update).
*   \`<Output>\`: Shows the agent's actions, including \`add_memory\` or \`add_entity_memory\` calls (these are *suggestions*).

**Rules:**

1.  **Review Suggestions:** Examine the \`add_memory\` and \`add_entity_memory\` calls in the \`<Output>\` in light of the agent's intent.
2.  **Evaluate Necessity:** Based on the suggested content, determine if the information is truly important, new, or corrective compared to the existing memories shown in \`<Input>\` (<YourMemories>, <YourMemoriesAbout...>). Avoid redundant entries.
3.  **Select Target Slot & Justify (Index Range: 0 to limit-1 - See CRITICAL NOTE):**
    *   For \`add_memory\` suggestions deemed necessary: If there's an empty slot in \`<YourMemories>\` (indices 0 to ${this.agent.meta.memoryLimit - 1}), use the first available index. If all ${this.agent.meta.memoryLimit} slots are full, **explicitly justify** why the chosen existing memory (index between 0 and ${this.agent.meta.memoryLimit - 1}) is the *least important* or *most outdated* based on the agent's intent and current context, before selecting its index to overwrite. **Ensure the selected index is strictly less than ${this.agent.meta.memoryLimit}.**
    *   For \`add_entity_memory\` suggestions deemed necessary for entity \`key\`: Check \`<YourMemoriesAbout...>\` for that 'key'. If there's an empty slot (indices 0 to ${this.agent.meta.entityMemoryLimit - 1}), use the first available index within that range. If all ${this.agent.meta.entityMemoryLimit} slots (indices 0 to ${this.agent.meta.entityMemoryLimit - 1}) for that entity are full, **explicitly justify** why the chosen existing memory (index between 0 and ${this.agent.meta.entityMemoryLimit - 1}) *for that specific entity* is the *least important* or *most outdated* based on intent and context, before selecting its index to overwrite. **Ensure the selected index is strictly less than ${this.agent.meta.entityMemoryLimit}.**
4.  **Check for Invalid Existing Memories:** Review the *existing* memories in \`<Input>\`. If any memory slot contains information that is clearly outdated or invalidated by the current interaction context (even without a specific 'add_...' suggestion), plan to update it. **If clearing/overwriting based on this rule, briefly justify why the existing memory is invalid.**
5.  **Consolidate & Prioritize:** If multiple updates are suggested or needed, prioritize the most critical ones based on the agent's intent. You might consolidate related information if appropriate, respecting length limits.
6.  **Use Update Tools:** For each necessary update, call the appropriate tool (ensuring the specified index is within the valid range: **0 to limit-1**):
    *   'update_memory(index, memory)' for general memories (index 0 to ${this.agent.meta.memoryLimit - 1}).
    *   'update_entity_memory(key, index, memory)' for entity-specific memories (index 0 to ${this.agent.meta.entityMemoryLimit - 1}).
7.  **CRITICAL - Clearing Invalid Memories:** If existing information in a slot (identified in step 3 for overwriting, or step 4 for invalidation) is no longer relevant or correct based on the agent's intent or current context, use the update tool for that slot but provide an **empty string (\'\"\"\')** as the 'memory' argument to effectively clear it.
8.  **English Only:** All 'memory' content provided to the update tools MUST be in English.
9.  **Conciseness:** Ensure the 'memory' content adheres to the length limits defined in the tool parameters.
10. **CRITICAL INDEXING NOTE:** Memory slots use **zero-based indexing**. This means for a limit of \`N\`, the valid indices are **0, 1, ..., N-1**. The index \`N\` itself is **OUT OF BOUNDS**. For example, if the limit is 5, the valid indices are 0, 1, 2, 3, and 4. **Always use an index within the valid range.**
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

The context the agent received (including current memory state *before* this update):
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

Agent's actions, including \`add_memory\` or \`add_entity_memory\` calls (these are *suggestions*):
<Output>
${JSON.stringify(toolCalls, null, 2)}
</Output>
  `,
    });

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `Following the rules in the system prompt, analyze the agent's last turn to determine what memory updates are needed.`,
      },
      ...contextContents,
      {
        type: 'text',
        text: `
Now, based on your analysis, use the 'update_memory' and/or 'update_entity_memory' tools to perform the necessary changes.

**Reminder of Critical Rules:**
1.  **Justify Overwrites:** If you overwrite an existing memory, you must justify your choice.
2.  **Indexing:** Indices are zero-based (0 to limit-1). Using an index outside this range will fail.
3.  **Clearing Memory:** To clear an invalid or outdated memory slot, update it with an empty string ("").
4.  **No Redundancy:** Do not add information that is already present or is unimportant.
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
