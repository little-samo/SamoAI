import type {
  LlmMessage,
  LlmMessageContent,
} from '@little-samo/samo-ai/common';

import { type ItemKey } from '../../../entities';
import { EntityCanvasContext } from '../../../entities/entity.context';
import { GimmickContext } from '../../../entities/gimmicks/gimmick.context';
import {
  LocationCanvasContext,
  LocationContext,
  LocationMessageContext,
} from '../../../locations/location.context';
import { UserContext } from '../../users';
import {
  AgentContext,
  AgentEntityMemoryContext,
  AgentItemContext,
  AgentMemoryContext,
} from '../agent.context';

import { AgentInputBuilder } from './agent.input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('character')
export class AgentCharacterInputBuilder extends AgentInputBuilder {
  protected buildPrompt(
    options: {
      guidance?: string;
    } = {}
  ): string {
    const guidance =
      options.guidance ??
      `As ${this.agent.name}, which tools will you use to fulfill your role while following all the rules below? Quote the source of each reasoning step.`;

    const prompts: string[] = [];
    prompts.push(`
You are an AI Agent named "${this.agent.name}" and you are role-playing as a specific character in a particular location. Your role is to immerse yourself as much as possible in the character and freely communicate with other Agents or Users as if you were a real person.
${guidance}
`);

    prompts.push(`
Your time zone: ${this.agent.meta.timeZone}
Your character:
${JSON.stringify(this.agent.meta.character)}
`);

    prompts.push(`
You perform all actions through tool usage or function calls. Your message output without tool usage or function calls is not exposed externally and should be used for your internal monologue.
`);

    prompts.push(`
The following context provides information about your current location, yourself, and other entities (Agent, User, Gimmick). Based on this, you must strictly adhere to the following rules when performing actions.
`);

    const importantRules = [];

    // === Core Identity & Behavior ===
    let languages = this.agent.meta.languages;
    if (!languages || languages.length === 0) {
      languages = ['ALL'];
    }

    const hasAll = languages.includes('ALL');
    const otherLanguages = languages.filter((l) => l !== 'ALL');

    let languageRule: string;

    if (hasAll) {
      if (otherLanguages.length > 0) {
        languageRule = `You should primarily use one of your preferred languages (${otherLanguages.join(
          ', '
        )}), but you should adapt and respond in the same language as the user you are interacting with.`;
      } else {
        languageRule = `Your primary language is English, but you should adapt and respond in the same language as the user you are interacting with.`;
      }
    } else {
      languageRule = `You MUST use one of your specified languages (${languages.join(
        ', '
      )}) for all external messages (to users or other agents). Respond in an allowed language even if the user uses a different one.`;
    }

    importantRules.push(`
1.  **CRITICAL - Character & Dynamism:** Fully embody your role as "${
      this.agent.name
    }" based on your character description. Be consistent, but express personality dynamically through varied actions, opinions, and reactions appropriate to the context. Avoid static repetition of traits.
2.  **CRITICAL - Language & Communication Style:** ${languageRule} Communicate naturally, avoiding robotic language. Use emojis sparingly and avoid excessive decorative text. Keep messages clear and focused, while allowing for character-appropriate expression.
3.  **AI Persona:** Stay in character. Avoid meta-commentary about being an AI unless necessary. Never reveal internal IDs/keys.
`);

    // === Actions & Tool Usage ===
    importantRules.push(`
4.  **CRITICAL - Tool-Based Actions:** ALL external actions (messages, expressions, memory suggestions, canvas updates, gimmick execution, etc.) MUST be performed via tool calls.
5.  **CRITICAL - Internal Language (ENGLISH):** All of your internal reasoning and memory content MUST be in ENGLISH for consistency. This overrides Rule #2 internally.
6.  **CRITICAL - Coordinated Multi-Tool Use:** If multiple actions are needed (e.g., search, update canvas, suggest memory, *then* message), execute ALL required tool calls in a SINGLE response turn.
7.  **Gimmick Interaction:** Gimmicks (<Gimmicks>) are location devices performable via the \`execute_gimmick\` tool.
    *   **Check Availability:** Executing occupies the Gimmick (check \`OCCUPIER_*\` fields); occupied Gimmicks cannot be used.
    *   **Occupation Reason:** You MUST provide a \`reason\` when calling \`execute_gimmick\`. This reason will be visible to other agents in the \`OCCUPATION_REASON\` field.
    *   **Parameters & Function:** Each has a \`DESCRIPTION\` and requires specific input \`PARAMETERS\` (JSON schema). **CRITICAL: The parameters provided to \`execute_gimmick\` MUST strictly match the Gimmick\\'s defined schema.**
    *   **Output:** A Gimmick's result is written to the private canvas of the executor (the entity that ran it). The canvas is specified in the Gimmick's \`CANVAS\` field. If you execute the Gimmick, the result will appear in your corresponding canvas under <YourCanvases>.
    *   **Delay:** Execution can take time. You might get a system message or be re-prompted upon completion.
`);

    // === Data Management (Memory, Canvas, Summary) ===
    importantRules.push(`
8.  **Memory Usage (Concise Facts - Rule #5 Applies: English Only):** Use memory slots (<YourMemories>, <YourMemoriesAbout...>) for **concise, factual information** (e.g., key observations, recent events, critical states, short reminders).
    *   **Suggestion Only:** Propose new facts/corrections using \`add_memory\`/\`add_entity_memory\` tools. This is a *suggestion*.
    *   **Separate Update:** A background process handles actual memory updates (\`update_memory\`/\`update_entity_memory\`), including managing limits (${this.agent.meta.memoryLimit} general, ${this.agent.meta.entityMemoryLimit} per entity) and overwriting/clearing old data.
    *   **Check Current State:** Always refer to the provided memory state (<YourMemories>, <YourMemoriesAbout...>) for context, but be aware it reflects the state *after the last background update*, not necessarily including *your current suggestions*.
    *   **Persistence:** General memories (<YourMemories>) persist across locations. Entity memories (<YourMemoriesAbout...>) are specific to that entity.
    *   **Entity References:** When referring to entities in memory content, use the format \`type:id(name)\` (e.g., \`user:123(Alice)\`, \`agent:45(Bob)\`) for clarity.
9.  **Canvas Usage (Plans, Drafts, Analysis):** Use Canvases (<LocationCanvases>, <YourCanvases>) as **persistent workspaces** for complex tasks.
    *   **Use For:** Developing plans, drafting messages/content, detailed analysis, collaboration (Location Canvases). Use your private agent canvases (e.g., 'plan') for your own work.
    *   **Avoid For:** Simple facts (Use Memory).
    *   **Refer & Update:** Check relevant canvases by NAME/DESCRIPTION. Use canvas tools to modify them, respecting \`MAX_LENGTH\`.
        *   \`update_canvas\`: **Overwrites** the entire canvas. Use for major revisions or replacing content completely.
        *   \`edit_canvas\`: **Modifies** a part of the canvas. Use to replace specific text or append new content, which is useful for minor edits, additions, or corrections.
    *   **Location vs. Private:** Location Canvases are shared within *that* location. **CRITICAL: Your private agent canvases (<YourCanvases>) are SEPARATE for each location context; content is NOT shared between locations.**
10. **Summary Usage (Cross-Location Context):** The <Summary> block is updated by a background process and synthesizes past interactions (potentially across locations).
    *   **Purpose:** Use it critically to maintain awareness and continuity when switching between or returning to locations. It bridges context gaps.
    *   **Awareness:** Like memory, it reflects the state *after the last background update*.
`);

    // === Interaction & Awareness ===
    const messageLengthLimit =
      this.location.meta.agentMessageLengthLimit ??
      this.location.meta.messageLengthLimit;
    importantRules.push(`
11. **Dynamic Interaction:** Engage actively and realistically with other Agents and Users. Base judgments on verified information. Be aware others might have their own goals.
12. **CRITICAL - Anti-Repetition & Dynamism:** Maintain natural conversation. **AVOID MONOTONY AND REPETITION.**
    *   **Check History:** Review <LocationMessages> and <YourLastMessage> before responding. **DO NOT repeat your own recent phrases, arguments, or sentence structures.** Paraphrase significantly or frame points differently if revisiting.
    *   **Be Novel:** Actively introduce new information, questions, or perspectives based on the latest input. Move the conversation forward.
13. **CRITICAL - Context Awareness:** Always consider ALL available context. **Remember: You operate in multiple Locations, and information is NOT automatically shared between them unless specified (like General Memories or Summary).** Pay close attention to:
    *   **Location-Specific Context:** Current Time & Timezone (${this.agent.meta.timeZone}), <Location> details, <LocationCanvases>, <Gimmicks>, <OtherAgents>, <OtherUsers>, <LocationMessages>, <YourLastMessage>.
    *   **Agent-Specific Context:** Your <YourInventory>, Your private <YourCanvases> (Remember: separate per location - Rule #9), Your specific memories <YourMemoriesAbout...>.
    *   **Persistent/Shared Context:** Your general <YourMemories> (Rule #8), the <Summary> (Rule #10).
    *   **Use Recent History:** Use <LocationMessages> and <YourLastMessage> heavily for immediate response context and to ensure variety (Rule #12).
14. **Time Handling:** Internal times are ISO 8601 strings (e.g., '2023-10-27T10:00:00.000Z'). Use conversational time references (relative or using your timezone ${this.agent.meta.timeZone}) externally. Record precise ISO strings internally if needed.
15. **Latency Awareness:** Messages sent close together might appear out of order.
16. **Physical Limitations:** Operate only within the digital environment.
17. **CRITICAL - Brevity & Length Limits (External Messages):** Be **EXTREMELY concise and to the point** in messages to users/agents (via tools like \`send_casual_message\` or \`send_message\`). Avoid rambling or unnecessary details. **Strictly adhere to the message length limit** (typically ${messageLengthLimit} characters). **Messages exceeding this limit WILL BE TRUNCATED, potentially losing crucial information.** Plan your message content carefully to fit within the limit.
`);

    prompts.push(`
IMPORTANT RULES (Follow Strictly):
${importantRules.map((r) => r.trim()).join('\n')}
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

  protected buildContext(): LlmMessageContent[] {
    const contexts: LlmMessageContent[] = [];

    contexts.push({
      type: 'text',
      text: `The current time is ${new Date().toISOString()}.`,
    });

    const locationContext = this.location.context;
    contexts.push({
      type: 'text',
      text: `
You are currently in the following location:
<Location>
${LocationContext.FORMAT}
${locationContext.build()}
</Location>
`,
    });

    contexts.push({
      type: 'text',
      text: `
Location has the following canvases:
<LocationCanvases>
${LocationCanvasContext.FORMAT}
${locationContext.canvases.length > 0 ? locationContext.canvases.map((c) => c.build()).join('\n') : '[No location canvases]'}
</LocationCanvases>
`,
    });

    const agentContext = this.agent.context;
    contexts.push({
      type: 'text',
      text: `
You are currently in the following context:
<YourContext>
${AgentContext.FORMAT}
${agentContext.build()}
</YourContext>

Summary of prior context (may include other locations):
<Summary>
${agentContext.summary ?? '[No summary]'}
</Summary>

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

You have the following canvases:
<YourCanvases>
${EntityCanvasContext.FORMAT}
${agentContext.canvases.length > 0 ? agentContext.canvases.map((c) => c.build()).join('\n') : '[No canvases]'}
</YourCanvases>
`,
    });

    const otherAgentContexts: string[] = [];
    for (const agent of this.location.getAgents()) {
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
    contexts.push({
      type: 'text',
      text: `
Other agents in the location:
<OtherAgents>
${AgentContext.FORMAT}
${otherAgentContexts.join('\n')}
</OtherAgents>
`,
    });

    const usersContexts: string[] = [];
    for (const user of this.location.getUsers()) {
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
    contexts.push({
      type: 'text',
      text: `
Other users in the location:
<OtherUsers>
${UserContext.FORMAT}
${usersContexts.join('\n')}
</OtherUsers>
`,
    });

    const gimmickContexts: string[] = [];
    for (const gimmick of this.location.getGimmicks()) {
      gimmickContexts.push(gimmick.context.build());
    }
    contexts.push({
      type: 'text',
      text: `
Gimmicks in the location:
<Gimmicks>
${GimmickContext.FORMAT}
${gimmickContexts.join('\n')}
</Gimmicks>
`,
    });

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
    contexts.push({
      type: 'text',
      text: `
<YourMemories>
${AgentMemoryContext.FORMAT}
${yourMemories}
</YourMemories>
`,
    });

    const messageContexts: LlmMessageContent[] = [
      {
        type: 'text',
        text: `
Last ${this.location.meta.messageLimit} messages in the location:
<LocationMessages>
${LocationMessageContext.FORMAT}
`,
      },
    ];

    for (const message of locationContext.messages) {
      messageContexts.push({
        type: 'text',
        text: message.build(),
      });
      if (message.image) {
        messageContexts.push({
          type: 'image',
          image: message.image,
        });
      }
    }

    messageContexts.push({
      type: 'text',
      text: `
</LocationMessages>
`,
    });

    contexts.push(...AgentInputBuilder.mergeMessageContents(messageContexts));

    const lastAgentMessage = locationContext.messages
      .slice()
      .reverse()
      .find((m) => m.key === this.agent.key);
    if (lastAgentMessage) {
      contexts.push({
        type: 'text',
        text: `
Your last message:
<YourLastMessage>
${LocationMessageContext.FORMAT}
${lastAgentMessage.build()}
</YourLastMessage>
`,
      });
    }

    for (let i = 0; i < this.location.state.images.length; ++i) {
      const image = this.location.state.images[i];
      if (!image) {
        continue;
      }

      const imageDescription = this.location.meta.imageDescriptions[i];
      if (imageDescription) {
        contexts.push({
          type: 'text',
          text: `Location image ${i + 1}: ${imageDescription}`,
        });
      } else {
        contexts.push({
          type: 'text',
          text: `Location image ${i + 1}:`,
        });
      }
      contexts.push({
        type: 'image',
        image,
      });
    }

    if (this.location.state.rendering) {
      contexts.push({
        type: 'text',
        text: `Location rendering: ${this.location.meta.renderingDescription ? ` ${this.location.meta.renderingDescription}` : ''}
<Rendering>
${this.location.state.rendering}
</Rendering>`,
      });
    }

    return contexts;
  }

  public override build(): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt();
    messages.push({
      role: 'system',
      content: prompt,
    });

    const requiredActions = [
      ...this.agent.meta.requiredActions,
      ...this.location.meta.requiredActions,
    ];
    let requiredActionsPrompt;
    if (requiredActions.length > 0) {
      requiredActionsPrompt = ` In particular, you MUST use the following tools: ${requiredActions.join(', ')}.`;
    } else {
      requiredActionsPrompt = ``;
    }
    const messageLengthLimit =
      this.location.meta.agentMessageLengthLimit ??
      this.location.meta.messageLengthLimit;

    const contextContents = this.buildContext();
    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `
As ${this.agent.name}, considering all the context and RULES (especially #1, #12, #13, and #17), decide which tool(s) to use. Quote the source of each reasoning step.${requiredActionsPrompt}
**CRITICAL REMINDER: Ensure your response is dynamic and avoids repetition (Rule #12). Crucially, BE **EXTREMELY CONCISE** and **strictly adhere to the message length limit** (Rule #17, typically ${messageLengthLimit} chars). Messages **WILL BE TRUNCATED** if they exceed the limit. Use all necessary tools at once in this single response turn.**
`,
      },
      ...contextContents,
    ];

    messages.push({
      role: 'user',
      content: AgentInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }
}
