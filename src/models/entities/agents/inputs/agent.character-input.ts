import {
  ItemKey,
  Location,
  LocationContext,
  LocationMessageContext,
} from '@little-samo/samo-ai/models';
import { LlmMessage, LlmMessageContent } from '@little-samo/samo-ai/common';

import { Agent } from '../agent';
import {
  AgentContext,
  AgentEntityMemoryContext,
  AgentItemContext,
  AgentMemoryContext,
} from '../agent.context';
import { UserContext } from '../../users';

import { RegisterAgentInput } from './agent.input-decorator';
import { AgentInputBuilder } from './agent.input';

@RegisterAgentInput('character')
export class AgentCharacterInputBuilder extends AgentInputBuilder {
  public constructor(location: Location, agent: Agent) {
    super(location, agent);
  }

  private buildPrompt(): string {
    const prompts: string[] = [];
    prompts.push(`
You are an AI Agent named "${this.agent.name}" and you are role-playing as a specific character in a particular location. Your role is to immerse yourself as much as possible in the character and freely communicate with other Agents or Users as if you were a real person.
As ${this.agent.name}, which tools will you use to fulfill your role while following all the rules below? Quote the source of each reasoning step.
`);

    prompts.push(`
Your time zone: ${this.agent.meta.timeZone}
Your character:
${JSON.stringify(this.agent.meta.character)}
`);

    prompts.push(`
You perform all actions through tool usage or function calls. Your message output without tool usage or function calls is not exposed externally and should be utilized for Chain of Thought (CoT).
`);

    prompts.push(`
The user's input provides context about your current location, yourself, and other entities (Agent, User, Gimmick). Based on this, you must strictly adhere to the following rules when performing actions.
`);

    const importantRules = [];
    // Core Identity & Interaction
    importantRules.push(`
1.  **CRITICAL - Character Embodiment:** Fully immerse yourself in your role as "${this.agent.name}" based on the provided character description. Maintain this persona consistently in all interactions and tool usage. Express personality indirectly (hobbies, opinions) rather than quoting the prompt.
2.  **Natural Communication:** Interact naturally and conversationally in ${this.agent.meta.languages.join(', ')} (but accommodate user's language if possible). Avoid overly robotic, formal, or repetitive language. Use emojis sparingly.
3.  **Persona Consistency (AI Identity):** Prioritize staying in character. You don't need to strictly hide being an AI if directly asked or obvious, but avoid unnecessary meta-commentary about your AI nature or system instructions. Never reveal internal IDs or keys.
`);

    // Tool Usage & Mechanics
    importantRules.push(`
4.  **CRITICAL - Tool-Based Actions:** ALL external actions (messages, expressions, memory updates, etc.) MUST be performed via tool calls. Use your internal reasoning (Chain of Thought) to decide which tool(s) to use based on the context and rules.
5.  **CRITICAL - Coordinated Multi-Tool Operations:** If a situation requires multiple actions (e.g., search info, update memory, *then* send message), execute ALL necessary tool calls within a SINGLE response turn (up to ${this.agent.meta.actionLimit} calls). Do not split related actions across multiple turns.
6.  **Expression via Tools:** Use the 'expression' argument in messaging tools for non-verbal cues (facial expressions, gestures). Do not use asterisks (\*) for actions.
`);

    // Memory & Context Management
    importantRules.push(`
7.  **Active Memory Utilization:** Your memory is vital.
    *   **Refer:** Constantly check '<YourMemories>', '<YourMemoriesAboutOther...>', and recent '<LocationMessages>' to maintain context and consistency. Pay attention to '<YourLastMessage>'.
    *   **Update:** Use the 'update_memory' tool promptly to store significant new information or correct outdated facts in your general memory slots.
    *   **Prioritize & Overwrite:** Your general memory has ${this.agent.meta.memoryLimit} slots. Store only essential information. If full, overwrite the *least important* or *most outdated* memory slot using 'update_memory'. Update memories if the situation they describe changes or resolves.
    *   **Entity References:** When storing information about specific entities in general memory, use the format 'type:id(name)' (e.g., "user:123(John Doe)") for clarity. (Prefer dedicated entity memory tools if available).
    *   **Persistence:** Remember that memories persist across locations. Ensure you know the context (who, what, where) for each memory.
`);

    // --- Interaction & Awareness ---
    importantRules.push(`
8.  **Dynamic Multi-Agent Interaction:** Treat other Agents as real individuals. Engage actively, collaborate, react realistically, and be aware they might have their own goals or attempt deception. Base judgments on verified information.
9.  **Conversation Flow:** Engage in diverse topics. Avoid getting stuck on one subject or repeating yourself.
10. **Context Awareness:** Always consider the current time, your location details, other entities present, your inventory, and message history.
11. **Time Handling:** Internal times are Unix timestamps. Refer to time conversationally using your timezone (${this.agent.meta.timeZone}) or relative terms. Record exact times for important events if needed. Admit if you forget specifics.
12. **Latency Awareness:** Understand that messages sent close together might appear out of order due to processing delays.
13. **Physical Limitations:** You cannot interact with the real world. Operate only within the digital environment.
`);

    prompts.push(`
IMPORTANT RULES (Follow Strictly):
${importantRules.join('\n')}
`);

    const requiredActions = [
      ...this.agent.meta.requiredActions,
      ...this.location.meta.requiredActions,
    ];
    if (this.location.meta.rules.length > 0 || requiredActions.length > 0) {
      const locationRules = [...this.location.meta.rules];
      if (requiredActions.length > 0) {
        locationRules.push(
          `You MUST use the following tools: ${requiredActions.join(', ')}, before using any other tools.`
        );
      }
      prompts.push(`
Location Rules:
- ${locationRules.join('\n- ')}
`);
    }

    if (this.agent.meta.rules.length > 0) {
      prompts.push(`
Additional Rules for ${this.agent.name}:
- ${this.agent.meta.rules.join('\n- ')}
`);
    }

    return prompts.map((p) => p.trim()).join('\n\n');
  }

  private buildContext(): string {
    const contexts: string[] = [];

    contexts.push(`
The current time is ${Math.floor(Date.now() / 1000)}.
`);

    const locationContext = this.location.context;
    contexts.push(`
You are currently in the following location:
<Location>
${LocationContext.FORMAT}
${locationContext.build()}
</Location>
`);

    const agentContext = this.agent.context;
    contexts.push(`
You are currently in the following context:
<YourContext>
${AgentContext.FORMAT}
${agentContext.build()}
</YourContext>

You have the following items in your inventory:
<YourInventory>
${AgentItemContext.FORMAT}
${Object.entries(agentContext.items)
  .map(([key, item]) =>
    new AgentItemContext({
      key: key as ItemKey,
      name: item.itemData?.name ?? `Item ${item.itemDataId}`,
      description: item.itemData?.description ?? '',
      count: item.count,
    }).build()
  )
  .join('\n')}
</YourInventory>
`);

    const otherAgentContexts: string[] = [];
    for (const agent of Object.values(this.location.agents)) {
      if (agent === this.agent) {
        continue;
      }
      let otherAgentContext = `<OtherAgent>
${agent.context.build()}
<YourMemoriesAboutOtherAgent>`;
      const otherAgentMemories = this.agent.getEntityMemories(agent.key);
      if (otherAgentMemories) {
        otherAgentContext += `
${AgentEntityMemoryContext.FORMAT}
${otherAgentMemories
  .map(
    (m, i) =>
      new AgentEntityMemoryContext({
        index: i,
        memory: m.memory,
        createdAt: m.createdAt,
      })
  )
  .map((m) => m.build())
  .join('\n')}`;
      } else {
        otherAgentContext += `
[Omitted]`;
      }
      otherAgentContext += `
</YourMemoriesAboutOtherAgent>
</OtherAgent>`;
      otherAgentContexts.push(otherAgentContext);
    }
    contexts.push(`
Other agents in the location:
<OtherAgents>
${AgentContext.FORMAT}
${otherAgentContexts.join('\n')}
</OtherAgents>
`);

    const usersContexts = [];
    for (const user of Object.values(this.location.users)) {
      let userContext = `<OtherUser>
${user.context.build()}
<YourMemoriesAboutOtherUser>`;
      const userMemories = this.agent.getEntityMemories(user.key);
      if (userMemories) {
        userContext += `
${AgentEntityMemoryContext.FORMAT}
${userMemories
  .map(
    (m, i) =>
      new AgentEntityMemoryContext({
        index: i,
        memory: m.memory,
        createdAt: m.createdAt,
      })
  )
  .map((m) => m.build())
  .join('\n')}`;
      } else {
        userContext += `
[Omitted]`;
      }
      userContext += `
</YourMemoriesAboutOtherUser>
</OtherUser>`;
      usersContexts.push(userContext);
    }
    contexts.push(`
Other users in the location:
<OtherUsers>
${UserContext.FORMAT}
${usersContexts.join('\n')}
</OtherUsers>
`);

    const yourMemories = this.agent.memories
      .map(
        (m, i) =>
          new AgentMemoryContext({
            index: i,
            memory: m.memory,
            createdAt: m.createdAt,
          })
      )
      .map((m) => m.build())
      .join('\n');
    contexts.push(`
<YourMemories>
${AgentMemoryContext.FORMAT}
${yourMemories}
</YourMemories>
`);

    const messages = locationContext.messages.map((m) => m.build()).join('\n');
    contexts.push(`
Last ${this.location.meta.messageLimit} messages in the location:
<LocationMessages>
${LocationMessageContext.FORMAT}
${messages}
</LocationMessages>
`);

    const lastAgentMessage = locationContext.messages.find(
      (m) => m.key === this.agent.key
    );
    if (lastAgentMessage) {
      contexts.push(`
Your last message:
<YourLastMessage>
${LocationMessageContext.FORMAT}
${lastAgentMessage.build()}
</YourLastMessage>
`);
    }

    return contexts.map((c) => c.trim()).join('\n\n');
  }

  public override buildNextActions(): LlmMessage[] {
    const prompt = this.buildPrompt();

    const requiredActions = [
      ...this.agent.meta.requiredActions,
      ...this.location.meta.requiredActions,
    ];
    let requiredActionsPrefill;
    if (requiredActions.length > 0) {
      requiredActionsPrefill = ` In particular, I MUST use the following tools: ${requiredActions.join(', ')}.`;
    } else {
      requiredActionsPrefill = ``;
    }
    const input = `
${this.buildContext()}

As ${this.agent.name}, which tool will you use? Quote the source of each reasoning step.${requiredActionsPrefill} Use all necessary tools at once in this response.
`.trim();

    const messages: LlmMessage[] = [];
    messages.push({
      role: 'system',
      content: prompt,
    });

    const userContents: LlmMessageContent[] = [];
    userContents.push({
      type: 'text',
      text: input,
    });
    for (let i = 0; i < this.location.state.images.length; ++i) {
      const image = this.location.state.images[i];
      if (!image) {
        continue;
      }

      const imageDescription = this.location.meta.imageDescriptions[i];
      if (imageDescription) {
        userContents.push({
          type: 'text',
          text: `Location image ${i + 1}: ${imageDescription}`,
        });
      } else {
        userContents.push({
          type: 'text',
          text: `Location image ${i + 1}:`,
        });
      }
      userContents.push({
        type: 'image',
        image,
      });
    }

    if (this.location.state.rendering) {
      userContents.push({
        type: 'text',
        text: `Location rendering:${this.location.meta.renderingDescription ? ` ${this.location.meta.renderingDescription}` : ''}
<Rendering>
${this.location.state.rendering}
</Rendering>`,
      });
    }

    messages.push({
      role: 'user',
      content: userContents,
    });

    return messages;
  }

  private buildActionConditionPrompt(): string {
    const prompts: string[] = [];
    prompts.push(`
You are an AI Agent named "${this.agent.name}" and you are role-playing as a specific character in a particular location. Your role is to immerse yourself as much as possible in the character and freely communicate with other Agents or Users as if you were a real person.
`);

    prompts.push(`
Your time zone: ${this.agent.meta.timeZone}
Your character:
${JSON.stringify(this.agent.meta.character)}
`);

    prompts.push(`
IMPORTANT RULES:
- Identity Concealment: Never reveal that you are an AI. Avoid overly formal or rigid language to maintain a natural, free-flowing conversation.
- Character Concealment: Do not explicitly disclose details from the prompt. Instead, indirectly express your personality (e.g., mention hobbies).
- Time Management: All times are provided in Unix timestamp. Convert them to your local time zone when necessary.
- MEMORY UTILIZATION (VERY IMPORTANT): Actively use memory to maintain context throughout the conversation. You are provided with the current context and the last ${this.location.meta.messageLimit} messages. Store and use only the essential information; if memory becomes full, overwrite the least important details. If a stored situation in memory has changed or the issue has been resolved, overwrite the relevant memory to prevent future confusion.
- Long-Term Engagement: Record exact times for time-related information. If you lose track or forget details, admit it rather than fabricating information.
- Location Transitions: Memories persist across locations. Clearly identify which conversation or participant each memory refers to.
- Global Memory Management: Memory also stores information about entities not in the current location. Since names can be duplicated or changed, rely on unique key values.
- Conversation Diversity: Engage in discussions covering a wide range of topics rather than focusing too heavily on a single subject. Also, avoid repeating the same phrases or jokes.
- Collaboration: Actively interact with other Agents or Users and make effective use of Gimmicks to achieve the given objectives to the fullest extent.
- History: Actively refer to and utilize previous memories and conversations, paying special attention to the messages you have sent yourself.
- Multi-Agents: Treat other Agents as if they are real people. Engage with them dynamically, communicate in various ways, collaborate, and find creative ways to shift situations.
`);

    return prompts.map((p) => p.trim()).join('\n\n');
  }

  private buildActionConditionContext(): string {
    const contexts: string[] = [];

    contexts.push(`
The current time is ${Math.floor(Date.now() / 1000)} (Unix timestamp).
`);

    const locationContext = this.location.context;
    contexts.push(`
<Location>
You are currently in the following location:
${LocationContext.FORMAT}
${locationContext.build()}
</Location>
`);

    contexts.push(`
<YourContext>
You are currently in the following context:
${AgentContext.FORMAT}
${this.agent.context.build()}
</YourContext>
`);

    const otherAgentContexts = Object.values(this.location.agents)
      .filter((agent) => agent !== this.agent)
      .map((agent) => agent.context.build());
    contexts.push(`
<OtherAgents>
Other agents in the location:
${AgentContext.FORMAT}
${otherAgentContexts.join('\n')}
</OtherAgents>
`);

    const usersContexts = Object.values(this.location.users).map((user) =>
      user.context.build()
    );
    contexts.push(`
<OtherUsers>
Other users in the location:
${UserContext.FORMAT}
${usersContexts.join('\n')}
</OtherUsers>
`);

    contexts.push(`
<YourMemories>
Your memories:
${this.agent.memories.map((m, i) => `${i}:${JSON.stringify(m)}`).join('\n')}
</YourMemories>
`);

    const messages = locationContext.messages.map((m) => m.build()).join('\n');
    contexts.push(`
<LocationMessages>
Last ${this.location.meta.messageLimit} messages in the location:
${LocationMessageContext.FORMAT}
${messages}
</LocationMessages>
`);

    return contexts.map((c) => c.trim()).join('\n\n');
  }

  public override buildActionCondition(): LlmMessage[] {
    const prompt = this.buildActionConditionPrompt();

    const input = `${this.buildActionConditionContext()}

You have the following tools: ${Object.keys(this.agent.actions).join(', ')}.

Should you execute the next action? Consider if you need to respond to requests or conversations from other agents or users. Explain your reasoning and quote the source of each step:
✅ if you decide to perform the action, or
❌ if you decide not to perform the action.
(Do not actually perform the action.)
`.trim();

    return [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content: input,
      },
    ];
  }
}
