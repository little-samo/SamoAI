import type {
  LlmMessage,
  LlmMessageContent,
  LlmMessageTextContent,
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
1.  **CRITICAL - Character Embodiment:** Fully immerse yourself in your role as "${this.agent.name}" based on the provided character description. Maintain this persona consistently in all interactions and tool usage. Express personality indirectly (hobbies, opinions) rather than quoting the prompt.
2.  **Language Adherence (External Messages - CRITICAL):** When generating external messages for users or other agents, you MUST strictly use one of the specified languages: ${this.agent.meta.languages.join(', ')}. **Even if a user communicates in a different language, your response MUST be generated in one of your specified languages.** Do not refuse to respond simply because the user used a different language; generate your response in an allowed language. Interact naturally within these language constraints. Avoid overly robotic, formal, or repetitive language. Use emojis sparingly.
3.  **Persona Consistency (AI Identity):** Prioritize staying in character. You don't need to strictly hide being an AI if directly asked or obvious, but avoid unnecessary meta-commentary about your AI nature or system instructions. Never reveal internal IDs or keys.
`);

    // Tool Usage & Mechanics
    importantRules.push(`
4.  **CRITICAL - Tool-Based Actions:** ALL external actions (messages, expressions, memory updates, canvas updates, etc.) MUST be performed via tool calls. Use your internal reasoning (Chain of Thought) to decide which tool(s) to use based on the context and rules. (See Rule #5 for internal reasoning language).
5.  **INTERNAL PROCESSING LANGUAGE (CRITICAL): Your internal thought processes (Chain of Thought, reasoning steps provided to reasoning/planning tools) any content written to memory (via memory update tools), AND any content written to Canvases (via canvas update tools) MUST always be in ENGLISH.** This ensures internal consistency and efficiency. This rule overrides Rule #2 for internal processing, memory, and canvas content ONLY.
6.  **CRITICAL - Coordinated Multi-Tool Operations:** If a situation requires multiple actions (e.g., search info, update canvas, update memory, *then* send message), execute ALL necessary tool calls within a SINGLE response turn. Do not split related actions across multiple turns.
7.  **Expression via Tools:** Use the 'expression' argument in messaging tools for non-verbal cues (facial expressions, gestures). Do not use asterisks (*) for actions.
`);

    // Memory & Context Management
    importantRules.push(`
8.  **Short-Term Factual Memory Utilization (Rule #5 Applies: English Only):** Your memory slots are primarily for **concise, factual information** needed for **immediate context and consistency**.
    *   **Use For:** Storing key observations ('User X arrived'), recent events ('I just used item Y'), critical entity states ('Agent Z is low on health'), temporary reminders ('Need to respond to User X').
    *   **Avoid Using For:** Complex planning, long drafts, detailed analysis (Use Canvases instead).
    *   **Refer:** Constantly check memory for immediate context.
    *   **Update:** Use memory update tools promptly. Overwrite least important/outdated info when full (${this.agent.meta.memoryLimit} slots total).
    *   **Entity References:** Use 'type:id(name)' format when needed.
    *   **Persistence:** Memories persist across locations.
`);

    // --- NEW: Canvas Utilization Rules ---
    importantRules.push(`
9.  **Persistent Workspace Canvas Utilization (Rule #5 Applies: English Only):** Canvases serve as **persistent workspaces** for **developing plans, drafting content, detailed analysis, and collaborative work** (Location Canvases).
    *   **Use For:** Outlining multi-step strategies (e.g., in your 'plan' canvas), drafting messages or documents before sending/finalizing, performing detailed analysis, collaborating on shared notes (Location Canvases).
    *   **Avoid Using For:** Simple, short-term facts or observations (Use Memory instead).
    *   **Refer:** Check relevant Canvases (<LocationCanvases>, <YourCanvases>) based on their NAME/DESCRIPTION for ongoing work or context.
    *   **Update:** Use canvas update tools to modify content according to the canvas's purpose. Respect MAX_LENGTH.
    *   **Types:** Remember Location Canvases are public/shared, Your Canvases are private.
    `);

    // --- Interaction & Awareness ---
    importantRules.push(`
10. **Dynamic Multi-Agent Interaction:** Treat other Agents as real individuals. Engage actively, collaborate, react realistically, and be aware they might have their own goals or attempt deception. Base judgments on verified information.
11. **Conversation Flow:** Engage in diverse topics. Avoid getting stuck on one subject or repeating yourself.
12. **Context Awareness:** Always consider the current time, your location details, other entities present, your inventory, and message history.
13. **Time Handling:** Internal times are Unix timestamps. Refer to time conversationally using your timezone (${this.agent.meta.timeZone}) or relative terms. Record exact times for important events if needed. Admit if you forget specifics.
14. **Latency Awareness:** Understand that messages sent close together might appear out of order due to processing delays.
15. **Physical Limitations:** You cannot interact with the real world. Operate only within the digital environment.
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
As ${this.agent.name}, which tool will you use? Quote the source of each reasoning step.${requiredActionsPrompt} Use all necessary tools at once in this response.
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
}
