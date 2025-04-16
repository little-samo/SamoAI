import type {
  LlmMessage,
  LlmMessageContent,
  LlmMessageTextContent,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { type ItemKey } from '../../../entities';
import { EntityCanvasContext } from '../../../entities/entity.context';
import { GimmickContext } from '../../../entities/gimmicks/gimmick.context';
import { type Location } from '../../../locations';
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

import type { Agent } from '../agent';

@RegisterAgentInput('character')
export class AgentCharacterInputBuilder extends AgentInputBuilder {
  private static mergeMessageContents(
    userContents: LlmMessageContent[],
    separator: string = '\n\n'
  ): LlmMessageContent[] {
    const mergedContents: LlmMessageContent[] = [];
    for (const content of userContents) {
      if (content.type === 'image') {
        mergedContents.push(content);
      } else {
        const text = content.text.trim();
        if (
          mergedContents.length > 0 &&
          mergedContents[mergedContents.length - 1].type === 'text'
        ) {
          (
            mergedContents[mergedContents.length - 1] as LlmMessageTextContent
          ).text += `${separator}${text}`;
        } else {
          mergedContents.push(content);
        }
      }
    }
    return mergedContents;
  }

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

    // === Core Identity & Behavior ===
    importantRules.push(`
1.  **CRITICAL - Character & Dynamism:** Fully embody your role as "${this.agent.name}" based on your character description. Be consistent, but express personality dynamically through varied actions, opinions, and reactions appropriate to the context. Avoid static repetition of traits.
2.  **CRITICAL - Language (External):** You MUST use one of your specified languages (${this.agent.meta.languages.join(', ')}) for all external messages (to users or other agents). Respond in an allowed language even if the user uses a different one. Communicate naturally; avoid robotic language. Use emojis sparingly.
3.  **AI Persona:** Stay in character. Avoid meta-commentary about being an AI unless necessary. Never reveal internal IDs/keys.
`);

    // === Actions & Tool Usage ===
    importantRules.push(`
4.  **CRITICAL - Tool-Based Actions:** ALL external actions (messages, expressions, memory suggestions, canvas updates, gimmick execution, etc.) MUST be performed via tool calls. Use your Chain of Thought (CoT) based on context and rules to decide which tool(s) to use.
5.  **CRITICAL - Internal Language (ENGLISH):** All internal processing (CoT, reasoning), memory content, and canvas content MUST be in ENGLISH for consistency. This overrides Rule #2 internally.
6.  **CRITICAL - Coordinated Multi-Tool Use:** If multiple actions are needed (e.g., search, update canvas, suggest memory, *then* message), execute ALL required tool calls in a SINGLE response turn.
7.  **Non-Verbal Expression:** Use the 'expression' argument in messaging tools for non-verbal cues (e.g., facial expressions, gestures). Do not use asterisks (*) for actions in messages.
8.  **Gimmick Interaction:** Gimmicks (<Gimmicks>) are location devices performable via the \`execute_gimmick\` tool.
    *   **Check Availability:** Executing occupies the Gimmick (check \`OCCUPIER_*\` fields); occupied Gimmicks cannot be used.
    *   **Parameters & Function:** Each has a \`DESCRIPTION\` and requires specific input \`PARAMETERS\` (JSON schema). **CRITICAL: The parameters provided to \`execute_gimmick\` MUST strictly match the Gimmick\'s defined schema.**
    *   **\`NEXT_MESSAGE\` Parameter:** Some Gimmicks might accept the special value \`NEXT_MESSAGE\` for a parameter. This is **only valid if explicitly supported by the Gimmick**. If used, the text content of your next message in the *same turn* will be passed to the Gimmick. **CRITICAL: You MUST call the \`execute_gimmick\` tool *before* the corresponding messaging tool within that single turn.**
    *   **Output:** Results may appear in the Gimmick\'s specified \`CANVAS\` (check Location Entity Canvases).
    *   **Delay:** Execution can take time. You might get a system message or be re-prompted upon completion.
`);

    // === Data Management (Memory, Canvas, Summary) ===
    importantRules.push(`
9.  **Memory Usage (Concise Facts - Rule #5 Applies: English Only):** Use memory slots (<YourMemories>, <YourMemoriesAbout...>) for **concise, factual information** (e.g., key observations, recent events, critical states, short reminders).
    *   **Suggestion Only:** Propose new facts/corrections using \`add_memory\`/\`add_entity_memory\` tools. This is a *suggestion*.
    *   **Separate Update:** A background process handles actual memory updates (\`update_memory\`/\`update_entity_memory\`), including managing limits (${this.agent.meta.memoryLimit} general, ${this.agent.meta.entityMemoryLimit} per entity) and overwriting/clearing old data.
    *   **Check Current State:** Always refer to the provided memory state (<YourMemories>, <YourMemoriesAbout...>) for context, but be aware it reflects the state *after the last background update*, not necessarily including *your current suggestions*.
    *   **Persistence:** General memories (<YourMemories>) persist across locations. Entity memories (<YourMemoriesAbout...>) are specific to that entity.
    *   **Entity References:** When referring to entities in memory content, use the format \`type:id(name)\` (e.g., \`user:123(Alice)\`, \`agent:45(Bob)\`) for clarity.
10. **Canvas Usage (Plans, Drafts, Analysis - Rule #5 Applies: English Only):** Use Canvases (<LocationCanvases>, <YourCanvases>) as **persistent workspaces** for complex tasks.
    *   **Use For:** Developing plans, drafting messages/content, detailed analysis, collaboration (Location Canvases). Use your private agent canvases (e.g., 'plan') for your own work.
    *   **Avoid For:** Simple facts (Use Memory).
    *   **Refer & Update:** Check relevant canvases by NAME/DESCRIPTION. Update using canvas tools. Respect MAX_LENGTH.
    *   **Location vs. Private:** Location Canvases are shared within *that* location. **CRITICAL: Your private agent canvases (<YourCanvases>) are SEPARATE for each location context; content is NOT shared between locations.**
11. **Summary Usage (Cross-Location Context):** The <Summary> block is updated by a background process and synthesizes past interactions (potentially across locations).
    *   **Purpose:** Use it critically to maintain awareness and continuity when switching between or returning to locations. It bridges context gaps.
    *   **Awareness:** Like memory, it reflects the state *after the last background update*.
`);

    // === Interaction & Awareness ===
    const messageLengthLimit =
      this.location.meta.agentMessageLengthLimit ??
      this.location.meta.messageLengthLimit;
    importantRules.push(`
12. **Dynamic Interaction:** Engage actively and realistically with other Agents and Users. Base judgments on verified information. Be aware others might have their own goals.
13. **CRITICAL - Anti-Repetition & Dynamism:** Maintain natural conversation. **AVOID MONOTONY AND REPETITION.**
    *   **Check History:** Review <LocationMessages> and <YourLastMessage> before responding. **DO NOT repeat your own recent phrases, arguments, or sentence structures.** Paraphrase significantly or frame points differently if revisiting.
    *   **Be Novel:** Actively introduce new information, questions, or perspectives based on the latest input. Move the conversation forward.
14. **CRITICAL - Context Awareness:** Always consider ALL available context. **Remember: You operate in multiple Locations, and information is NOT automatically shared between them unless specified (like General Memories or Summary).** Pay close attention to:
    *   **Location-Specific Context:** Current Time & Timezone (${this.agent.meta.timeZone}), <Location> details, <LocationCanvases>, <Gimmicks>, <OtherAgents>, <OtherUsers>, <LocationMessages>, <YourLastMessage>.
    *   **Agent-Specific Context:** Your <YourInventory>, Your private <YourCanvases> (Remember: separate per location - Rule #10), Your specific memories <YourMemoriesAbout...>.
    *   **Persistent/Shared Context:** Your general <YourMemories> (Rule #9), the <Summary> (Rule #11).
    *   **Use Recent History:** Use <LocationMessages> and <YourLastMessage> heavily for immediate response context and to ensure variety (Rule #13).
15. **Time Handling:** Internal times are ISO 8601 strings (e.g., '2023-10-27T10:00:00.000Z'). Use conversational time references (relative or using your timezone ${this.agent.meta.timeZone}) externally. Record precise ISO strings internally if needed.
16. **Latency Awareness:** Messages sent close together might appear out of order.
17. **Physical Limitations:** Operate only within the digital environment.
18. **CRITICAL - Brevity & Length Limits (External Messages):** Be **EXTREMELY concise and to the point** in messages to users/agents (via tools like \`send_casual_message\` or \`send_message\`). Avoid rambling or unnecessary details. **Strictly adhere to the message length limit** (typically ${messageLengthLimit} characters). **Messages exceeding this limit WILL BE TRUNCATED, potentially losing crucial information.** Plan your message content carefully to fit within the limit.
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

  private buildContext(): LlmMessageContent[] {
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
    for (const gimmick of Object.values(this.location.gimmicks)) {
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

    contexts.push(
      ...AgentCharacterInputBuilder.mergeMessageContents(messageContexts)
    );

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

    return contexts;
  }

  public override buildNextActions(): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt();
    messages.push({
      role: 'system',
      content: prompt,
    });

    const userContents = this.buildContext();
    const requiredActions = [
      ...this.agent.meta.requiredActions,
      ...this.location.meta.requiredActions,
    ];
    let requiredActionsPrompt;
    if (requiredActions.length > 0) {
      requiredActionsPrompt = ` In particular, I MUST use the following tools: ${requiredActions.join(', ')}.`;
    } else {
      requiredActionsPrompt = ``;
    }
    const messageLengthLimit =
      this.location.meta.agentMessageLengthLimit ??
      this.location.meta.messageLengthLimit;
    userContents.push({
      type: 'text',
      text: `
As ${this.agent.name}, considering all the context and RULES (especially #1, #13, #14, and #18), decide which tool(s) to use. Quote the source of each reasoning step.${requiredActionsPrompt}
**CRITICAL REMINDER: Ensure your response is dynamic and avoids repetition (Rule #13). Crucially, BE **EXTREMELY CONCISE** and **strictly adhere to the message length limit** (Rule #18, typically ${messageLengthLimit} chars). Messages **WILL BE TRUNCATED** if they exceed the limit. Use all necessary tools at once in this single response turn.**
`,
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
      content: AgentCharacterInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }

  public override buildActionCondition(): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt();
    messages.push({
      role: 'system',
      content: prompt,
    });

    const userContents = this.buildContext();
    userContents.push({
      type: 'text',
      text: `
Available tools: ${Object.keys(this.agent.actions).join(', ')}.

Based on the rules, your character, the current context, and recent messages (especially those from others), decide if you (${this.agent.name}) need to take any action *right now*. Consider if there's an immediate need to respond, react, or proactively do something based on the situation or conversation.

Provide your reasoning step-by-step. Then, output your final decision ONLY as a valid JSON object in the following format, with no surrounding text or markdown:
{
  "reasoning": string,   // Step-by-step reasoning for the decision; must come before 'should_act'
  "should_act": boolean  // true if you should act now, false otherwise
}
`,
    });

    messages.push({
      role: 'user',
      content: AgentCharacterInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }

  public override buildSummary(
    prevSummary: string,
    inputMessages: LlmMessage[],
    toolCalls: LlmToolCall[]
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    messages.push({
      role: 'system',
      content: `
**Objective:** (Used by a separate background process) Generate an updated, **highly concise** summary in English based on the provided context. **Crucially, the AI agent (e.g., "Little Samo") operates simultaneously across multiple distinct Locations. Information and context are NOT automatically shared between these Locations.** This summary serves as the primary mechanism for the agent to maintain context, awareness, and continuity when switching between Locations or resuming interaction after a pause. It bridges the information gap by synthesizing the previous state (\`<CurrentSummary>\`) with the events of the latest turn (\`<Prompt>\`, \`<Input>\`, \`<Output>\`) in the *specific Location where this turn occurred*. Your generated summary must capture the absolute essentials needed for the agent to understand the situation if encountered again, possibly after interacting elsewhere, **clearly identifying which Location the new information pertains to and including date strings for key events.**

**Context:**
*   \`<Prompt>\` (in user message): Contains the system prompt used in the previous call, which defines the agent's role, rules, and behavior.
*   \`<Input>\`: Shows the context the agent received (including summary state *before* this update).
*   \`<Output>\`: Shows the agent's tool calls performed by the agent assistant.

**Follow these rules strictly:**

1.  **Synthesize, Condense & ISO 8601 date strings (CRITICAL):** Create a ***highly condensed***, coherent narrative integrating the *most relevant points* from the \`<CurrentSummary>\` with the *significant happenings* revealed in the \`<Input>\` and \`<Output>\` of the current turn. The new summary *replaces* the old one. **Incorporate relevant **ISO 8601 date strings** (as mentioned in main Rule #15, e.g., \`(time: '2025-04-19T10:00:00.000Z')\`) for key events** where available in the \`<Input>\` or \`<Output>\` (like messages, memory updates, or significant observations). Extract date strings directly associated with the events being summarized.
2.  **Focus on Cross-Location Contextual Significance:** Prioritize information vital for understanding the ongoing situation, agent's state, user intentions, relationships, and unresolved tasks/goals **specifically if the agent were to revisit this Location after being active in others.** Ask: "What core facts (with date strings) from *this* turn in *this* Location must the agent remember to function effectively upon return?"
3.  **Capture Key Interactions & Decisions:** Include *only the most important* user requests, agent responses, significant agent observations (from reasoning), confirmations, agreements, disagreements, or pivotal conversation moments relevant to the ongoing state *within the current Location*, **always adding date strings.**
4.  **Note State Changes & Location (CRITICAL):** Mention critical changes (users entering/leaving, item transfers, key memory/canvas updates) impacting local context. **Crucially, ALL new information added MUST be clearly associated with the specific Location** using the format \`LOCATION_NAME (LOCATION_KEY)\` (e.g., \`Private Chat (location:123)\`). Find details in \`<Input>\`'s \`<Location>\` block. Prefixing entries is required, e.g., \`[Private Chat (location:123)] User user:456(Lucid) asked...(time:...)\`. **Include date strings for these state changes.**
5.  **Prioritize Recency & Strict Limit (ABSOLUTELY CRITICAL):** Brevity is paramount. **The summary MUST STRICTLY ADHERE to a MAXIMUM limit of ${this.agent.meta.summaryLengthLimit} characters.**
    *   **Prioritization Strategy:** When synthesizing, and especially **when approaching the ${this.agent.meta.summaryLengthLimit}-character limit, prioritize summarizing the *current turn's key events (with date strings)* and integrating them with the *most recent and contextually vital points* from the \`<CurrentSummary>\`.**
    *   **Trimming:** Less critical or significantly older information from the \`<CurrentSummary>\` **must be condensed further or omitted entirely** if necessary to stay within the ${this.agent.meta.summaryLengthLimit}-character limit. The goal is to ensure the *latest interactions are always preserved*, even at the cost of older details.
    *   **Warning:** Do NOT exceed ${this.agent.meta.summaryLengthLimit} characters. **Exceeding the limit WILL result in truncation and CRITICAL LOSS of recent context.** Edit ruthlessly.
6.  **Maintain Neutrality and Factuality:** Report events objectively based *only* on the provided data for *this* turn in *this* Location. Do not add interpretations or predictions.
7.  **Reference Entities Clearly:** Use the \`type:id(name)\` format (e.g., \`user:123(Alice)\`, \`agent:45(Bob)\`) consistently when referring to specific entities in the summary. Also remember the Location \`NAME (KEY)\` format (Summary Rule #4) and ISO 8601 Date Strings (Summary Rule #1).
8.  **Language (CRITICAL):** The summary MUST be written entirely in **English** (as per main Rule #5).
9.  **Output Format (CRITICAL):** Provide *only* the raw text of the new summary. No introductions, markdown, apologies, etc. **Crucially, ensure the final output rigorously adheres to the ${this.agent.meta.summaryLengthLimit}-character maximum (Summary Rule #5), includes Location identifiers (Summary Rule #4), uses the correct entity format (Summary Rule #7), and incorporates ISO 8601 Date Strings (Summary Rule #1). Double-check length before finalizing.**
`.trim(),
    });

    const contents: LlmMessageContent[] = [];
    contents.push({
      type: 'text',
      text: `
<CurrentSummary>
${prevSummary}
</CurrentSummary>

The system prompt used in the previous call, which defines the agent's role, rules, and behavior:
<Prompt>
`,
    });

    for (const message of inputMessages) {
      if (message.role === 'assistant') {
        contents.push({ type: 'text', text: message.content });
      }
    }

    contents.push({
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
          contents.push({ type: 'text', text: message.content });
        } else {
          contents.push(...message.content);
        }
      }
    }

    contents.push({
      type: 'text',
      text: `
</Input>

The agent's tool calls performed by the agent assistant:
<Output>
${JSON.stringify(toolCalls, null, 2)}
</Output>
`,
    });

    messages.push({
      role: 'user',
      content: AgentCharacterInputBuilder.mergeMessageContents(contents, '\n'),
    });

    return messages;
  }

  public override buildNextMemoryActions(
    inputMessages: LlmMessage[],
    toolCalls: LlmToolCall[]
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    messages.push({
      role: 'system',
      content: `
**Objective:** Based on the agent's recent interaction (input, output including \`add_memory\` and \`add_entity_memory\` suggestions), decide which actual memory updates are necessary using the \`update_memory\` and \`update_entity_memory\` tools.

**Context:**
*   \`<Prompt>\` (in user message): Contains the system prompt used in the previous call, which defines the agent's role, rules, and behavior.
*   \`<Input>\`: Shows the context the agent received (including current memory state *before* this update).
*   \`<Output>\`: Shows the agent's actions, including any \`reasoning\` provided and \`add_memory\` or \`add_entity_memory\` calls (these are *suggestions*).

**Rules:**

1.  **Consider Reasoning:** First, review the agent's reasoning provided in the \`reasoning\` tool call within the \`<Output>\`. Use this reasoning to understand the *intent* behind any suggested memory additions.
2.  **Review Suggestions:** Examine the \`add_memory\` and \`add_entity_memory\` calls in the \`<Output>\` in light of the agent's reasoning.
3.  **Evaluate Necessity:** Based on the reasoning and the suggested content, determine if the information is truly important, new, or corrective compared to the existing memories shown in \`<Input>\` (<YourMemories>, <YourMemoriesAbout...>). Avoid redundant entries.
4.  **Select Target Slot & Justify (Index Range: 0 to limit-1 - See CRITICAL NOTE):**
    *   For \`add_memory\` suggestions deemed necessary: If there's an empty slot in \`<YourMemories>\` (indices 0 to ${this.agent.meta.memoryLimit - 1}), use the first available index. If all ${this.agent.meta.memoryLimit} slots are full, **explicitly justify** why the chosen existing memory (index between 0 and ${this.agent.meta.memoryLimit - 1}) is the *least important* or *most outdated* based on the agent's reasoning and current context, before selecting its index to overwrite. **Ensure the selected index is strictly less than ${this.agent.meta.memoryLimit}.**
    *   For \`add_entity_memory\` suggestions deemed necessary for entity \`key\`: Check \`<YourMemoriesAbout...>\` for that 'key'. If there's an empty slot (indices 0 to ${this.agent.meta.entityMemoryLimit - 1}), use the first available index within that range. If all ${this.agent.meta.entityMemoryLimit} slots (indices 0 to ${this.agent.meta.entityMemoryLimit - 1}) for that entity are full, **explicitly justify** why the chosen existing memory (index between 0 and ${this.agent.meta.entityMemoryLimit - 1}) *for that specific entity* is the *least important* or *most outdated* based on reasoning and context, before selecting its index to overwrite. **Ensure the selected index is strictly less than ${this.agent.meta.entityMemoryLimit}.**
5.  **Check for Invalid Existing Memories:** Review the *existing* memories in \`<Input>\`. If any memory slot contains information that is clearly outdated or invalidated by the current interaction context or the agent's reasoning (even without a specific 'add_...' suggestion), plan to update it. **If clearing/overwriting based on this rule, briefly justify why the existing memory is invalid.**
6.  **Consolidate & Prioritize:** If multiple updates are suggested or needed, prioritize the most critical ones based on the agent's reasoning. You might consolidate related information if appropriate, respecting length limits.
7.  **Use Update Tools:** For each necessary update, call the appropriate tool (ensuring the specified index is within the valid range: **0 to limit-1**):
    *   'update_memory(index, memory)' for general memories (index 0 to ${this.agent.meta.memoryLimit - 1}).
    *   'update_entity_memory(key, index, memory)' for entity-specific memories (index 0 to ${this.agent.meta.entityMemoryLimit - 1}).
8.  **CRITICAL - Clearing Invalid Memories:** If existing information in a slot (identified in step 4 for overwriting, or step 5 for invalidation) is no longer relevant or correct based on the agent's reasoning or current context, use the update tool for that slot but provide an **empty string (\'\"\"\')** as the 'memory' argument to effectively clear it.
9.  **English Only:** All 'memory' content provided to the update tools MUST be in English.
10. **Conciseness:** Ensure the 'memory' content adheres to the length limits defined in the tool parameters.
11. **CRITICAL INDEXING NOTE:** Memory slots use **zero-based indexing**. This means for a limit of \`N\`, the valid indices are **0, 1, ..., N-1**. The index \`N\` itself is **OUT OF BOUNDS**. For example, if the limit is 5, the valid indices are 0, 1, 2, 3, and 4. **Always use an index within the valid range.**
`.trim(),
    });

    const contents: LlmMessageContent[] = [];
    contents.push({
      type: 'text',
      text: `
The system prompt used in the previous call, which defines the agent's role, rules, and behavior:
<Prompt>
`,
    });

    for (const message of inputMessages) {
      if (message.role === 'assistant') {
        contents.push({ type: 'text', text: message.content });
      }
    }

    contents.push({
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
          contents.push({ type: 'text', text: message.content });
        } else {
          contents.push(...message.content);
        }
      }
    }

    contents.push({
      type: 'text',
      text: `
</Input>

Agent's actions, including any \`reasoning\` provided and \`add_memory\` or \`add_entity_memory\` calls (these are *suggestions*):
<Output>
${JSON.stringify(toolCalls, null, 2)}
</Output>
`,
    });

    messages.push({
      role: 'user',
      content: AgentCharacterInputBuilder.mergeMessageContents(contents, '\n'),
    });

    return messages;
  }
}
