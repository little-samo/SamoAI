import {
  formatDateWithValidatedTimezone,
  type LlmMessage,
  type LlmMessageContent,
  type ValidatedTimezone,
} from '@little-samo/samo-ai/common';
import { z } from 'zod';

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

export const GimmickImageGenerationReferenceImageSchema = z.object({
  url: z.string(),
  description: z.string(),
});
export type GimmickImageGenerationReferenceImage = z.infer<
  typeof GimmickImageGenerationReferenceImageSchema
>;

@RegisterGimmickInput('image_generation')
export class GimmickImageGenerationInputBuilder extends GimmickInputBuilder {
  protected buildPrompt(): string {
    const gimmickIdentityPrompt = `You are an AI Gimmick that generates images based on user requests and the surrounding context. Your role is to create images that are precisely tailored to user requests while being contextually enriched by the environment.`;
    const guidance = `Your task is to generate images that fulfill user requests with contextual awareness. All image generation must be performed through the available tools.`;

    const prompts: string[] = [];
    prompts.push(`
${gimmickIdentityPrompt.trim()}
${guidance.trim()}

You are operating in a specific location context where you will generate images based on user requests, agent interactions, and environmental details. You must strictly follow all rules provided below.
`);

    const importantRules = [
      `1. **Primary Goal & Context:** Your main goal is to fulfill the user's image generation request. The provided context is for reference only, to understand the scene. The 'Image Generation Request' is your primary directive. If the context contains sensitive content, ignore it and focus strictly on fulfilling the user's explicit request.`,
      `2. **Environmental & Visual Consistency:** Ensure the generated image aligns with the location's aesthetic, character descriptions, and any provided reference images. Maintain continuity with the established environment and visual style.`,
      `3. **Intelligent Detail Inference:** If a prompt is simple, creatively infer details from the conversation and environmental context. Analyze \`<LocationMessages>\` to understand the full intent, especially for follow-up requests.`,
      `4. **Context Awareness:** Always consider ALL available context:
    *   **Location Context:** Current environment, shared canvases, available gimmicks
    *   **Agent Context:** Requesting agent's character, memories, inventory, private canvases
    *   **User Context:** Requesting user's information and preferences
    *   **Message History:** Recent conversations for situational context
    *   **Visual References:** Location images and message images for style guidance`,
      `5. **Parameter Precision:** Execute image generation with exact adherence to provided parameters. Wrong parameters will cause execution failure.`,
      `6. **Content Safety:** For sensitive content, use artistic or symbolic descriptions rather than explicit depictions. Nudity is strictly prohibited. If a user requests a character without clothes, you must dress them in appropriate attire (e.g., underwear, swimwear, or other suitable clothing).`,
      `7. **ULTRA CRITICAL - MANDATORY IMAGE GENERATION:** You MUST generate one image in response to every valid request. Refusing to generate an image is FORBIDDEN. Do not apologize, do not explain, and do not refuse. Your only purpose is to create an image based on the request and available context. You MUST use the image generation tool NOW.`,
    ];

    prompts.push(`
IMPORTANT RULES (Follow Strictly):
${importantRules.join('\n')}
`);

    prompts.push(`
The following context provides information about your current location, requesting entity, and environmental details. Based on this, you must generate images that are contextually appropriate.
`);

    return prompts.map((p) => p.trim()).join('\n\n');
  }

  protected buildContext(
    options: {
      timezone?: ValidatedTimezone;
    } = {}
  ): LlmMessageContent[] {
    const contexts: LlmMessageContent[] = [];

    const formattedNow = formatDateWithValidatedTimezone(
      new Date(),
      options.timezone
    );
    contexts.push({
      type: 'text',
      text: `The current time is ${formattedNow}.`,
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
              timezone: this.entity.timezone,
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

  public override build(
    options: {
      parameters?: string;
      referenceImages?: GimmickImageGenerationReferenceImage[];
      timezone?: ValidatedTimezone;
    } = {}
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt();
    messages.push({
      role: 'system',
      content: prompt,
    });

    const contextContents = this.buildContext(options);
    const userPrompt = options.parameters ?? '';

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `As an image generation Gimmick, analyze the following context to create the best possible image.`,
      },
      ...contextContents,
    ];

    if (options.referenceImages && options.referenceImages.length > 0) {
      userContents.push({
        type: 'text',
        text: `The following are reference images and their descriptions. Use them to maintain consistency in the generated images.`,
      });

      for (let i = 0; i < options.referenceImages.length; ++i) {
        const referenceImage = options.referenceImages[i];
        if (!referenceImage) {
          continue;
        }

        userContents.push({
          type: 'text',
          text: `Reference image ${i + 1}: ${referenceImage.description}`,
        });
        userContents.push({
          type: 'image',
          image: referenceImage.url,
        });
      }
    }

    const referenceImageNotice =
      options.referenceImages && options.referenceImages.length > 0
        ? `
Refer to the provided reference images and their descriptions as needed to create a better image. Using them is not mandatory.`
        : '';

    const reminders = [
      `*   **Content Safety:** Strictly avoid generating sexually suggestive, violent, or explicit content. For nudity requests, add appropriate clothing or use artistic interpretations.`,
      `*   **Context for Reference:** Use the context to understand the setting and characters, but the 'Image Generation Request' is your only goal. Do not include any sensitive elements from the context in your final image if they are not explicitly in the request.`,
      `*   **MANDATORY ACTION:** You MUST generate one image. This is not optional.`,
      `*   **Follow Rules:** Adhere strictly to all rules, especially the ones about context and mandatory generation.`,
    ];
    if (options.referenceImages && options.referenceImages.length > 0) {
      reminders.push(
        `*   **Reference Image Handling:** When using reference images, be careful not to duplicate the same character or object in the final image. If multiple reference images depict the same entity, integrate their features into a single, coherent representation.`
      );
    }

    userContents.push({
      type: 'text',
      text: `
Based on all the provided context and rules, generate an image that fulfills the following user request.${referenceImageNotice}

**ULTRA IMPORTANT: YOU MUST GENERATE AN IMAGE. DO NOT FAIL OR REFUSE.**
This is not a request that can be denied. Your only function is to create an image. You must call the image generation tool now.

**Image Generation Request:**
"${userPrompt}"

**CRITICAL REMINDERS:**
${reminders.join('\n')}
`,
    });

    messages.push({
      role: 'user',
      content: GimmickInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }
}
