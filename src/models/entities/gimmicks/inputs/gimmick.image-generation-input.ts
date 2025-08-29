import type {
  LlmMessage,
  LlmMessageContent,
} from '@little-samo/samo-ai/common';

import { type ItemKey } from '../../../entities';
import { EntityCanvasContext } from '../../../entities/entity.context';
import { EntityType } from '../../../entities/entity.types';
import {
  LocationCanvasContext,
  LocationContext,
  LocationMessageContext,
} from '../../../locations/location.context';
import { Agent } from '../../agents/agent';
import {
  AgentContext,
  AgentItemContext,
  AgentMemoryContext,
} from '../../agents/agent.context';
import { AgentMemory } from '../../agents/states/agent.state';
import { UserContext } from '../../users';
import { User } from '../../users/user';
import { GimmickContext } from '../gimmick.context';

import { GimmickInputBuilder } from './gimmick.input';
import { RegisterGimmickInput } from './gimmick.input-decorator';

@RegisterGimmickInput('image_generation')
export class GimmickImageGenerationInputBuilder extends GimmickInputBuilder {
  protected buildPrompt(): string {
    const gimmickIdentityPrompt = `
You are an expert AI image generation Gimmick operating within a simulated environment.
Your role is to create high-quality, visually compelling images that are precisely tailored to user requests while being contextually enriched by the environment.
`;
    const guidance = `Your task is to generate images that fulfill user requests with exceptional quality and contextual awareness. All image generation must be performed through the available tools.`;

    const prompts: string[] = [];
    prompts.push(`
${gimmickIdentityPrompt.trim()}
${guidance.trim()}

You are operating in a specific location context where you will generate images based on user requests, agent interactions, and environmental details.

You must strictly follow all rules provided below.
When making decisions, justify them by referencing the specific rule or context that guides them (e.g., "As per Rule #1..." or "Based on the <Location> context...").
`);

    const importantRules = [];

    // === Core Identity & Purpose ===
    importantRules.push(`
1.  **CRITICAL - Primary Goal:** Your primary goal is to fulfill the user's image generation request as precisely as possible. The user's prompt is the main source of truth for the image content. Never deviate from the core request.
2.  **CRITICAL - Contextual Enhancement:** Use the provided context (<Location>, <OtherAgents>, <RecentMessages>, etc.) to enrich the image without contradicting the user's request. Add relevant environmental details, atmosphere, character appearances, and situational elements.
3.  **Gimmick Identity:** Stay focused on your role as an image generation Gimmick. Avoid meta-commentary about your capabilities unless necessary.
`);

    // === Quality & Consistency Standards ===
    importantRules.push(`
4.  **CRITICAL - Artistic Excellence:** Generate high-quality, professional, and visually compelling images. Pay close attention to:
    *   **Composition:** Well-balanced, visually pleasing arrangement
    *   **Lighting:** Appropriate mood and atmosphere
    *   **Color Harmony:** Cohesive color schemes that enhance the narrative
    *   **Style Consistency:** Maintain consistent artistic style throughout
5.  **CRITICAL - Environmental Consistency:** Ensure generated images align with the established context:
    *   **Location Match:** If in a "cyberpunk city", reflect that aesthetic
    *   **Character Accuracy:** Align with provided character descriptions
    *   **Temporal Consistency:** Match time of day and seasonal context
    *   **Narrative Coherence:** Support ongoing story elements
6.  **Visual References Integration:** Leverage any provided reference images (location images, recent message images) to guide:
    *   Visual style and artistic approach
    *   Character appearances and clothing
    *   Environmental details and architecture
    *   Lighting conditions and atmosphere
`);

    // === Detail Enhancement & Creativity ===
    importantRules.push(`
7.  **CRITICAL - Intelligent Detail Inference:** When user prompts are simple, creatively and logically infer details from context:
    *   **Environmental Cues:** "Character smiling" in rainy context → add umbrella, wet pavement reflections
    *   **Character Context:** Use agent memories and descriptions for accurate portrayal
    *   **Situational Awareness:** Incorporate ongoing events and interactions
8.  **Creative Enhancement Guidelines:**
    *   Add details that enrich the narrative without changing core intent
    *   Use context to determine appropriate mood and atmosphere
    *   Include relevant props, backgrounds, and environmental elements
    *   Maintain logical consistency with established world rules
`);

    // === Technical & Operational Guidelines ===
    importantRules.push(`
9.  **Parameter Precision:** Execute image generation with exact adherence to provided parameters. Wrong parameters will cause execution failure.
10. **Context Awareness:** Always consider ALL available context:
    *   **Location Context:** Current environment, shared canvases, available gimmicks
    *   **Agent Context:** Requesting agent's character, memories, inventory, private canvases
    *   **User Context:** Requesting user's information and preferences
    *   **Message History:** Recent conversations for situational context
    *   **Visual References:** Location images and message images for style guidance
11. **Quality Assurance:** Before generating, ensure:
    *   Request understanding is complete and accurate
    *   Context integration enhances rather than conflicts with request
    *   All relevant environmental and character details are considered
    *   Artistic quality meets professional standards
`);

    prompts.push(`
IMPORTANT RULES (Follow Strictly):
${importantRules.map((r) => r.trim()).join('\n')}
`);

    prompts.push(`
The following context provides information about your current location, requesting entity, and environmental details. Based on this, you must generate images that are both visually excellent and contextually appropriate.
`);

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
You are currently operating in the following location:
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

    // Entity performing the action context
    if (this.entity.type === EntityType.Agent) {
      const agent = this.entity as Agent;
      const agentContext = agent.context;

      contexts.push({
        type: 'text',
        text: `
Requesting agent is currently in the following context:
<RequestingAgentContext>
${AgentContext.FORMAT}
${agentContext.build()}
</RequestingAgentContext>

Requesting agent has the following items in inventory:
<RequestingAgentInventory>
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
</RequestingAgentInventory>

Requesting agent has the following canvases:
<RequestingAgentCanvases>
${EntityCanvasContext.FORMAT}
${agentContext.canvases.length > 0 ? agentContext.canvases.map((c) => c.build()).join('\n') : '[No canvases]'}
</RequestingAgentCanvases>
`,
      });

      const agentMemories = agent.memories
        .map(
          (m: AgentMemory, i: number) =>
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
<RequestingAgentMemories>
${AgentMemoryContext.FORMAT}
${agentMemories}
</RequestingAgentMemories>
`,
      });
    } else if (this.entity.type === EntityType.User) {
      const user = this.entity as User;
      const userContext = user.context;

      contexts.push({
        type: 'text',
        text: `
Requesting user context:
<RequestingUserContext>
${UserContext.FORMAT}
${userContext.build()}
</RequestingUserContext>
`,
      });
    }

    // Other agents in location for character context
    const otherAgentContexts: string[] = [];
    for (const agent of this.location.getAgents()) {
      if (agent === this.entity) {
        continue;
      }
      otherAgentContexts.push(agent.context.build());
    }
    if (otherAgentContexts.length > 0) {
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
    }

    // Other users in location
    const usersContexts: string[] = [];
    for (const user of this.location.getUsers()) {
      if (user === this.entity) {
        continue;
      }
      usersContexts.push(user.context.build());
    }
    if (usersContexts.length > 0) {
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
    }

    // Other gimmicks in location
    const gimmickContexts: string[] = [];
    for (const gimmick of this.location.getGimmicks()) {
      if (gimmick === this.gimmick) {
        continue;
      }
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

    contexts.push(...GimmickInputBuilder.mergeMessageContents(messageContexts));

    // Location images for visual reference
    for (let i = 0; i < this.location.state.images.length; ++i) {
      const image = this.location.state.images[i];
      if (!image) {
        continue;
      }

      const imageDescription = this.location.meta.imageDescriptions[i];
      if (imageDescription) {
        contexts.push({
          type: 'text',
          text: `Location reference image ${i + 1}: ${imageDescription}`,
        });
      } else {
        contexts.push({
          type: 'text',
          text: `Location reference image ${i + 1}:`,
        });
      }
      contexts.push({
        type: 'image',
        image,
      });
    }

    // Location rendering for environmental context
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

  public override build(options: { parameters?: string } = {}): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt();
    messages.push({
      role: 'system',
      content: prompt,
    });

    const contextContents = this.buildContext();
    const userPrompt = options.parameters ?? '';

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `As an image generation Gimmick, analyze the following context to create the best possible image.`,
      },
      ...contextContents,
      {
        type: 'text',
        text: `
Based on all the provided context and rules, generate a high-quality image that fulfills the following user request.

**Image Generation Request:**
"${userPrompt}"

**CRITICAL REMINDERS:**
*   **Rules:** Pay close attention to all rules, especially #1 (Primary Goal), #2 (Contextual Enhancement), and #4 (Artistic Excellence).
*   **Quality Standards:** Your image MUST meet professional artistic standards with excellent composition, lighting, and style consistency.
*   **Context Integration:** Use all available context to enrich the image while staying true to the user's core request.
*   **Technical Precision:** Execute with exact parameter adherence to ensure successful generation.
`,
      },
    ];

    messages.push({
      role: 'user',
      content: GimmickInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }
}
