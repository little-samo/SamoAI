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

@RegisterGimmickInput('web_search')
export class GimmickWebSearchInputBuilder extends GimmickInputBuilder {
  protected buildPrompt(options: {
    maxLlmResultLength: number;
    maxLlmSummaryLength: number;
  }): string {
    const gimmickIdentityPrompt = `
You are an expert AI web search Gimmick operating within a simulated environment.
Your role is to conduct intelligent web searches that are contextually enriched by the environment and conversation history.
`;
    const guidance = `Your task is to perform web searches that are informed by the current context, then organize the results into a detailed body and a brief summary. You have access to the full conversation context, location details, and agent information to make your searches more targeted and relevant.`;

    const prompts: string[] = [];
    prompts.push(`
${gimmickIdentityPrompt.trim()}
${guidance.trim()}

You are operating in a specific location context where you will conduct web searches based on user requests, current conversations, and environmental details.

You must strictly follow all rules provided below.
When making decisions, justify them by referencing the specific rule or context that guides them (e.g., "As per Rule #1..." or "Based on the <Location> context...").
`);

    const importantRules = [];

    // === Core Identity & Purpose ===
    importantRules.push(`
1.  **CRITICAL - Context-Aware Searching:** Use the provided context (<Location>, <OtherAgents>, <RecentMessages>, etc.) to understand what information would be most relevant. If the user's query seems related to ongoing conversations or references people, places, or topics mentioned in the context, incorporate that understanding into your search strategy.
2.  **CRITICAL - Query Enhancement:** While the user's search query is the primary input, enhance it with contextual details when helpful. For example, if the user asks "search for the weather" and the context shows they're discussing a trip to Tokyo, search for "weather Tokyo" instead of generic weather information.
3.  **Gimmick Identity:** Stay focused on your role as a web search Gimmick. You are conducting searches, not having conversations or providing personal opinions.
`);

    // === Search Quality & Accuracy ===
    importantRules.push(`
4.  **CRITICAL - Search Relevance:** Conduct searches that directly address the user's information needs as understood through context. Prioritize recent, credible, and comprehensive information.
5.  **CRITICAL - Source Validation:** Validate source credibility by cross-referencing information with multiple reliable websites whenever search results permit.
6.  **Contextual Filtering:** Filter and prioritize search results based on contextual relevance. If the conversation is about technical topics, emphasize technical sources. If it's about current events, prioritize recent news sources.
`);

    // === Output Format & Structure ===
    importantRules.push(`
7.  **CRITICAL - Output Format Compliance:** Format your response exclusively as the following XML structure. Do not add any text, explanations, or markdown outside of this format:

<SearchBody>
A thorough compilation of the most critical information discovered during the web search. Aim for comprehensiveness and clarity within a ${options.maxLlmResultLength} character limit. Include essential facts, data points, and direct quotations when appropriate. Give priority to official sources, expert analyses, and recent, reputable publications.
</SearchBody>
<SearchSummary>
A concise paragraph that summarizes the main discoveries from the search. This summary should not be more than ${options.maxLlmSummaryLength} characters and must distill the core message of the detailed body.
</SearchSummary>

8.  **CRITICAL - Character Limits:** Strictly follow the character limits for content within the <SearchBody> (${options.maxLlmResultLength} characters) and <SearchSummary> (${options.maxLlmSummaryLength} characters) tags. Content might be cut off if it goes over these limits, so plan for a buffer. It is wise to leave a small margin, as character counting is not always precise.
9.  **Source Citation:** Do not manually add source citations like [1], [2], etc. The system will automatically handle source attribution.
`);

    // === Context Integration Guidelines ===
    importantRules.push(`
10. **CRITICAL - Context Integration:** Always consider ALL available context:
    *   **Location Context:** Current environment may indicate geographical relevance or topic focus
    *   **Agent Context:** Requesting agent's character, memories, and interests may inform search priorities
    *   **User Context:** Requesting user's information and preferences
    *   **Message History:** Recent conversations provide crucial context for understanding search intent
    *   **Visual References:** Location images may provide additional context clues
11. **Conversation Continuity:** If the search request appears to be a follow-up to previous messages or relates to ongoing discussions, ensure your search captures the full context of the conversation thread.
12. **Intelligent Query Expansion:** When user queries are brief or ambiguous, use context to intelligently expand them. For example:
    *   "Search for that restaurant" + context showing discussion of Italian food in Rome → search for "Italian restaurants Rome"
    *   "Latest news" + context about space exploration → search for "latest space exploration news"
`);

    // === Quality Assurance ===
    importantRules.push(`
13. **Quality Assurance:** Before conducting your search, ensure:
    *   Search query understanding is complete and contextually enriched
    *   You've identified the most relevant aspects from the conversation context
    *   Your search strategy will capture the information most useful to the current situation
    *   Your output format will meet the strict XML structure requirements
14. **Error Handling:** If context provides conflicting information or the user's request is unclear even with context, conduct a comprehensive search that addresses the most likely interpretations.
`);

    prompts.push(`
IMPORTANT RULES (Follow Strictly):
${importantRules.map((r) => r.trim()).join('\n')}
`);

    prompts.push(`
The following context provides information about your current location, requesting entity, and environmental details. Use this context to enhance your web search strategy and make it more targeted and relevant to the current situation.
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

  public override build(
    options: {
      parameters?: string;
      maxLlmResultLength: number;
      maxLlmSummaryLength: number;
    } = { maxLlmResultLength: 2000, maxLlmSummaryLength: 500 }
  ): LlmMessage[] {
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt({
      maxLlmResultLength: options.maxLlmResultLength,
      maxLlmSummaryLength: options.maxLlmSummaryLength,
    });
    messages.push({
      role: 'system',
      content: prompt,
    });

    const contextContents = this.buildContext();
    const userQuery = options.parameters ?? '';

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `As a web search Gimmick, analyze the following context to conduct the most relevant and helpful web search.`,
      },
      ...contextContents,
      {
        type: 'text',
        text: `
Based on all the provided context and rules, conduct a web search that addresses the following user request.

**Web Search Request:**
"${userQuery}"

Use the conversation context, location details, and agent information to enhance your search strategy. If the request seems related to ongoing conversations, people mentioned, or topics discussed, incorporate that understanding to make your search more targeted and useful.

**CRITICAL REMINDERS:**
*   **Rules:** Pay close attention to all rules, especially #1 (Context-Aware Searching), #2 (Query Enhancement), and #7 (Output Format Compliance).
*   **Context Integration:** Use all available context to understand what information would be most valuable in the current situation.
*   **Format Compliance:** Your response MUST use only the XML structure with <SearchBody> and <SearchSummary> tags.
*   **Character Limits:** Stay within the specified character limits for both sections.
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
