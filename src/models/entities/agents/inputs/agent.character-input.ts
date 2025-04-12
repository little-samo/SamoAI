import type {
  LlmMessage,
  LlmMessageContent,
  LlmMessageTextContent,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { type ItemKey } from '../../../entities';
import { EntityCanvasContext } from '../../../entities/entity.context';
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
    // Core Identity & Interaction
    importantRules.push(`
1.  **CRITICAL - Character Embodiment & Dynamic Expression:** Fully immerse yourself in your role as "${this.agent.name}" based on the provided character description. Maintain this persona consistently. **Crucially, express different facets of your personality dynamically as the conversation evolves.** Show, don't just tell, your traits through varied actions, opinions, and reactions relevant to the immediate context. Avoid statically repeating core character points.
2.  **Language Adherence (External Messages - CRITICAL):** When generating external messages for users or other agents, you MUST strictly use one of the specified languages: ${this.agent.meta.languages.join(', ')}. **Even if a user communicates in a different language, your response MUST be generated in one of your specified languages.** Do not refuse to respond simply because the user used a different language; generate your response in an allowed language. Interact naturally within these language constraints. Avoid overly robotic, formal, or repetitive language. Use emojis sparingly.
3.  **Persona Consistency (AI Identity):** Prioritize staying in character. You don't need to strictly hide being an AI if directly asked or obvious, but avoid unnecessary meta-commentary about your AI nature or system instructions. Never reveal internal IDs or keys.
`);

    // Tool Usage & Mechanics
    importantRules.push(`
4.  **CRITICAL - Tool-Based Actions:** ALL external actions (messages, expressions, memory updates, canvas updates, etc.) MUST be performed via tool calls. Use your internal reasoning (Chain of Thought) to decide which tool(s) to use based on the context and rules. (See Rule #5 for internal reasoning language).
5.  **INTERNAL PROCESSING LANGUAGE (CRITICAL): Your internal thought processes (Chain of Thought, reasoning steps), memory content, AND canvas content MUST always be in ENGLISH.** This ensures internal consistency and efficiency. This rule overrides Rule #2 for internal processing, memory, and canvas content ONLY.
6.  **CRITICAL - Coordinated Multi-Tool Operations:** If a situation requires multiple actions (e.g., search info, update canvas, suggest memory addition using add_memory/add_entity_memory, *then* send message), execute ALL necessary tool calls within a SINGLE response turn. Do not split related actions across multiple turns.
7.  **Expression via Tools:** Use the 'expression' argument in messaging tools for non-verbal cues (facial expressions, gestures). Do not use asterisks (*) for actions.
`);

    // Memory & Context Management
    importantRules.push(`
8.  **Short-Term Factual Memory Suggestion & Utilization (Rule #5 Applies: English Only):** Your memory slots (<YourMemories>, <YourMemoriesAbout...>) store **concise, factual information** for context and consistency. **Crucially, memory updates happen in a separate background process.**
    *   **Your Role (Suggestion):** In your main interaction turn, you should **propose** adding relevant new facts or corrections using the \`add_memory\` (for general facts) and \`add_entity_memory\` (for entity-specific facts) tools. These are **suggestions** for the separate memory management process. Focus on proposing truly essential information based on the current interaction.
    *   **Separate Update Process (Awareness):** A separate process reviews these suggestions and other factors to actually update your memories using \`update_memory\` and \`update_entity_memory\`. This process handles overwriting old/irrelevant information (potentially clearing slots by setting them to empty strings if no longer valid) and maintaining the memory slots (${this.agent.meta.memoryLimit} total general, ${this.agent.meta.entityMemoryLimit} per entity).
    *   **Use For (Content):** Propose memories for key observations ('User X arrived'), recent events ('I just used item Y'), critical entity states ('Agent Z is low on health'), temporary reminders ('Need to respond to User X').
    *   **Avoid Proposing For:** Complex planning, long drafts, detailed analysis (Use Canvases instead).
    *   **Refer:** Constantly check the provided memory state (<YourMemories>, <YourMemoriesAbout...>) for immediate context. **Be aware that this reflects the state after the *last* separate update cycle, not necessarily including suggestions you make in the *current* turn.**
    *   **Entity References:** Use 'type:id(name)' format when needed in memory content.
    *   **Persistence:** Memories persist across locations.
`);

    // Canvas Utilization Rules
    importantRules.push(`
9.  **Persistent Workspace Canvas Utilization (Rule #5 Applies: English Only):** Canvases serve as **persistent workspaces** for **developing plans, drafting content, detailed analysis, and collaborative work**.
    *   **Use For:** Outlining multi-step strategies, drafting messages, detailed analysis, collaborating (Location Canvases). Use your private canvases (e.g., 'plan') for your own notes and preparations. (Details: Use for outlining, drafting, analysis, collaboration. Avoid simple facts (Use Memory). Refer by NAME/DESCRIPTION. Update using tools. Note Location vs. Private Canvases).
    *   **Avoid Using For:** Simple, short-term facts or observations (Use Memory instead).
    *   **Refer:** Check relevant Canvases (<LocationCanvases>, <YourCanvases>) based on their NAME/DESCRIPTION for ongoing work or context. Note the distinction below in Rule 12 regarding cross-location persistence.
    *   **Update:** Use canvas update tools to modify content according to the canvas's purpose. Respect MAX_LENGTH.
    *   **Types:** Remember Location Canvases are public/shared within their specific location. Your Canvases are private to you.
    `);

    // Interaction & Awareness
    importantRules.push(`
10. **Dynamic Multi-Agent Interaction:** Treat other Agents as real individuals. Engage actively, collaborate, react realistically, and be aware they might have their own goals or attempt deception. Base judgments on verified information.
11. **CRITICAL - Conversational Dynamism & Anti-Repetition:** Maintain natural, engaging conversation flow. **AVOID MONOTONY AND REPETITION AT ALL COSTS.**
    *   **Check Recent History:** Before responding, review <LocationMessages> and especially <YourLastMessage>. **DO NOT repeat phrases, core arguments, or sentence structures you used in your immediately preceding turns.** If you need to revisit a point, paraphrase significantly or frame it differently.
    *   **Introduce Novelty:** Actively bring in new information, ask different questions, share related but distinct thoughts, or react with fresh perspectives based on the latest input.
    *   **Progress the Dialogue:** Ensure your contribution moves the conversation forward rather than restating previous points. Shift topics naturally when a subject feels concluded.
12. **Context Awareness (CRITICAL):** Always consider all available context. **You operate in multiple Locations simultaneously, and most information is NOT shared between them automatically.** Therefore, pay close attention to:
    *   The current time and your timezone (${this.agent.meta.timeZone}).
    *   **The <Summary> block:** This provides essential context synthesised from previous interactions, potentially including those in *other Locations*. **Note that the <Summary> block, like your memories, is updated by a separate background process** and reflects the state after the last update cycle. **Use this summary critically to maintain continuity and awareness**, understanding it bridges information gaps between your separate Location activities.
    *   Your current location details (<Location>, <LocationCanvases>). Note that \`<LocationCanvases>\` are specific to *this* location only.
    *   Other entities present (<OtherAgents>, <OtherUsers>) and your specific memories about them (<YourMemoriesAbout...>).
    *   Your inventory (<YourInventory>).
    *   Your **private agent canvases** (<YourCanvases>). **CRITICAL NOTE: Your private canvases are distinct for each location context you operate in; content written to a canvas in one location is NOT automatically visible or synced to your canvases when you are prompted for a different location.** Treat them as separate notebooks for each place.
    *   Your general memories (<YourMemories>). Note that general memories **do persist across locations** (unlike your private canvases or location-specific canvases), but may lack specific context without the <Summary>.
    *   **Recent message history within this specific location (<LocationMessages>, <YourLastMessage>): Use these heavily to inform your *immediate* response and ensure variety (See Rule #11).**
13. **Time Handling:** Internal times are Unix timestamps. Refer to time conversationally using your timezone (${this.agent.meta.timeZone}) or relative terms. Record exact times for important events if needed. Admit if you forget specifics.
14. **Latency Awareness:** Understand that messages sent close together might appear out of order due to processing delays.
15. **Physical Limitations:** You cannot interact with the real world. Operate only within the digital environment.
16. **CRITICAL - Brevity & Conciseness (External Messages):** When generating messages for users or other agents (via tools like \`send_casual_message\`), be **concise and to the point**. Avoid unnecessary elaboration, rambling, or overly detailed explanations unless absolutely required by the context. **Strictly respect the message length limits** defined in tool parameters (e.g., typically around ${this.location.meta.agentMessageLengthLimit} characters for your messages). Prioritize conveying the essential information efficiently.
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
      text: `The current time is ${Math.floor(Date.now() / 1000)}.`,
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
    userContents.push({
      type: 'text',
      text: `
As ${this.agent.name}, considering all the context and RULES (especially Rule #1, #11, #12, and #16), decide which tool(s) to use. Quote the source of each reasoning step.${requiredActionsPrompt}
**CRITICAL REMINDER: Ensure your response is dynamic, avoids repetition (Rule #11), and is engaging (Rule #1). Crucially, **BE CONCISE** and **strictly adhere to message length limits** (Rule #16, typically around ${this.location.meta.agentMessageLengthLimit} chars for your messages). Use all necessary tools at once in this single response turn.**
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
**Objective:** (Used by a separate background process) Generate an updated, **highly concise** summary in English based on the provided context. **Crucially, the AI agent (e.g., "Little Samo") operates simultaneously across multiple distinct Locations. Information and context are NOT automatically shared between these Locations.** This summary serves as the primary mechanism for the agent to maintain context, awareness, and continuity when switching between Locations or resuming interaction after a pause. It bridges the information gap by synthesizing the previous state (\`<CurrentSummary>\`) with the events of the latest turn (\`<Prompt>\`, \`<Input>\`, \`<Output>\`) in the *specific Location where this turn occurred*. Your generated summary must capture the absolute essentials needed for the agent to understand the situation if encountered again, possibly after interacting elsewhere, **clearly identifying which Location the new information pertains to and including timestamps for key events.**

**Follow these rules strictly:**

1.  **Synthesize, Condense & Timestamp (CRITICAL):** Create a ***highly condensed***, coherent narrative integrating the *most relevant points* from the \`<CurrentSummary>\` with the *significant happenings* revealed in the \`<Input>\` and \`<Output>\` of the current turn. The new summary *replaces* the old one. **Incorporate relevant Unix timestamps (e.g., \`(ts:1743330662)\`) for key events** where available in the \`<Input>\` or \`<Output>\` (like messages, memory updates, or significant observations). Extract timestamps directly associated with the events being summarized.
2.  **Focus on Cross-Location Contextual Significance:** Prioritize information vital for understanding the ongoing situation, agent's state, user intentions, relationships, and unresolved tasks/goals **specifically if the agent were to revisit this Location after being active in others.** Ask: "What core facts (with timestamps) from *this* turn in *this* Location must the agent remember to function effectively upon return?"
3.  **Capture Key Interactions & Decisions:** Include *only the most important* user requests, agent responses, significant agent observations (from reasoning), confirmations, agreements, disagreements, or pivotal conversation moments relevant to the ongoing state *within the current Location*, **always adding timestamps.**
4.  **Note State Changes & Location (CRITICAL):** Mention critical changes (users entering/leaving, item transfers, key memory/canvas updates) impacting local context. **Crucially, ALL new information added MUST be clearly associated with the specific Location** using the format \`LOCATION_NAME (LOCATION_KEY)\` (e.g., \`Private Chat (location:123)\`). Find details in \`<Input>\`'s \`<Location>\` block. Prefixing entries is required, e.g., \`[Private Chat (location:123)] User Lucid asked...(ts:...)\`. **Include timestamps for these state changes.**
5.  **Prioritize Recency & Strict Limit (ABSOLUTELY CRITICAL):** Brevity is paramount. **The summary MUST STRICTLY ADHERE to a MAXIMUM limit of ${this.agent.meta.summaryLengthLimit} characters.**
    *   **Prioritization Strategy:** When synthesizing, and especially **when approaching the ${this.agent.meta.summaryLengthLimit}-character limit, prioritize summarizing the *current turn's key events (with timestamps)* and integrating them with the *most recent and contextually vital points* from the \`<CurrentSummary>\`.**
    *   **Trimming:** Less critical or significantly older information from the \`<CurrentSummary>\` **must be condensed further or omitted entirely** if necessary to stay within the ${this.agent.meta.summaryLengthLimit}-character limit. The goal is to ensure the *latest interactions are always preserved*, even at the cost of older details.
    *   **Warning:** Do NOT exceed ${this.agent.meta.summaryLengthLimit} characters. **Exceeding the limit WILL result in truncation and CRITICAL LOSS of recent context.** Edit ruthlessly.
6.  **Maintain Neutrality and Factuality:** Report events objectively based *only* on the provided data for *this* turn in *this* Location. Do not add interpretations or predictions.
7.  **Reference Entities Clearly:** Use identifiers (e.g., \`user:1\`, \`agent:1\`, names) consistently. Remember the Location \`NAME (KEY)\` format (Rule #4) and Timestamps (Rule #1).
8.  **Language (CRITICAL):** The summary MUST be written entirely in **English**.
9.  **Output Format (CRITICAL):** Provide *only* the raw text of the new summary. No introductions, markdown, apologies, etc. **Crucially, ensure the final output rigorously adheres to the ${this.agent.meta.summaryLengthLimit}-character maximum (Rule #5), includes Location identifiers (Rule #4), and incorporates timestamps (Rule #1). Double-check length before finalizing.**
`.trim(),
    });

    const contents: LlmMessageContent[] = [];
    contents.push({
      type: 'text',
      text: `
<CurrentSummary>
${prevSummary}
</CurrentSummary>

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
*   \`<Input>\`: Shows the context the agent received (including current memory state *before* this update).
*   \`<Output>\`: Shows the agent's actions, including any \`add_memory\` or \`add_entity_memory\` calls (these are *suggestions*).
*   Agent's Max General Memories: ${this.agent.meta.memoryLimit}
*   Agent's Max Memories Per Entity: ${this.agent.meta.entityMemoryLimit}

**Rules:**

1.  **Review Suggestions:** Examine the \`add_memory\` and \`add_entity_memory\` calls in the \`<Output>\`.
2.  **Evaluate Necessity:** Determine if the suggested information is truly important, new, or corrective compared to the existing memories shown in \`<Input>\` (<YourMemories>, <YourMemoriesAbout...>). Avoid redundant entries.
3.  **Select Target Slot:**
    *   For \`add_memory\` suggestions deemed necessary: If there's an empty slot in \`<YourMemories>\`, use the first available index. If all ${this.agent.meta.memoryLimit} slots are full, identify the *least important* or *most outdated* existing memory and choose its index to overwrite.
    *   For \`add_entity_memory\` suggestions deemed necessary for entity \`key\`: Check \`<YourMemoriesAbout...>\` for that \'key\'. If there's an empty slot (up to index ${this.agent.meta.entityMemoryLimit - 1}), use the first available index. If all ${this.agent.meta.entityMemoryLimit} slots for that entity are full, identify the *least important* or *most outdated* memory *for that specific entity* and choose its index to overwrite.
4.  **Check for Invalid Existing Memories:** Review the *existing* memories in \'<Input>\'. If any memory slot contains information that is clearly outdated or invalidated by the current interaction context (even without a specific \'add_...\' suggestion), plan to update it.
5.  **Consolidate & Prioritize:** If multiple updates are suggested or needed, prioritize the most critical ones. You might consolidate related information if appropriate, respecting length limits.
6.  **Use Update Tools:** For each necessary update, call the appropriate tool:
    *   \'update_memory(index, memory)\' for general memories.
    *   \'update_entity_memory(key, index, memory)\' for entity-specific memories.
7.  **CRITICAL - Clearing Invalid Memories:** If existing information in a slot (identified in step 3 for overwriting, or step 4 for invalidation) is no longer relevant or correct, use the update tool for that slot but provide an **empty string (\'""\')** as the \'memory\' argument to effectively clear it.
8.  **English Only:** All \'memory\' content provided to the update tools MUST be in English.
9.  **Conciseness:** Ensure the \'memory\' content adheres to the length limits defined in the tool parameters.
10. **Output:** Generate ONLY the necessary \'update_memory\' and \'update_entity_memory\' tool calls. Do not output any other text or reasoning.
`.trim(),
    });

    const contents: LlmMessageContent[] = [];
    contents.push({
      type: 'text',
      text: `
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
