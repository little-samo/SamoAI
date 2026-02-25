import {
  formatDateWithValidatedTimezone,
  type LlmMessage,
  type LlmMessageContent,
  type ValidatedTimezone,
} from '@little-samo/samo-ai/common';

import { EntityType } from '../../../entities/entity.types';
import {
  LocationContext,
  LocationMessageContext,
} from '../../../locations/location.context';
import { Agent } from '../../agents/agent';
import { AgentContext, AgentMemoryContext } from '../../agents/agent.context';
import { AgentMemory } from '../../agents/states/agent.state';
import { UserContext } from '../../users';
import { User } from '../../users/user';

import { GimmickInputBuilder } from './gimmick.input';
import { RegisterGimmickInput } from './gimmick.input-decorator';

@RegisterGimmickInput('web_search')
export class GimmickWebSearchInputBuilder extends GimmickInputBuilder {
  protected buildPrompt(options: {
    maxLlmResultLength: number;
    maxLlmSummaryLength: number;
  }): string {
    const prompts: string[] = [];
    prompts.push(`
You are an expert AI web search Gimmick operating within a simulated environment.
Your role is to conduct intelligent web searches enriched by the environment and conversation history, then organize the results into a detailed body and a brief summary.

You must strictly follow all rules provided below.
`);

    const importantRules = [];

    importantRules.push(`
1.  **CRITICAL - Context-Aware Query Enhancement:** The user's search query is the primary input. Enhance it using the provided context (<Location>, <RequestingAgent/User>, <RecentMessages>) to make the search more targeted:
    *   If the query is brief or ambiguous, expand it using conversation context (e.g., "search for that restaurant" + Italian food discussion in Rome → "Italian restaurants Rome")
    *   If the query relates to ongoing discussions, people, or topics in the message history, incorporate that understanding
    *   Consider location context for geographical relevance
2.  **CRITICAL - Search Quality:** Prioritize recent, credible, and comprehensive information. Filter results based on contextual relevance—technical sources for technical topics, news sources for current events. Cross-reference with multiple reliable sources when possible.
`);

    importantRules.push(`
3.  **CRITICAL - Output Format:** Format your response exclusively as the following XML structure. Do not add any text outside of this format:

<SearchBody>
A thorough compilation of the most critical information discovered. Aim for comprehensiveness and clarity within ${options.maxLlmResultLength} characters. Include essential facts, data points, and direct quotations. Prioritize official sources and recent publications.
</SearchBody>
<SearchSummary>
A concise paragraph summarizing the main discoveries, within ${options.maxLlmSummaryLength} characters.
</SearchSummary>

4.  **CRITICAL - Character Limits:** Stay within ${options.maxLlmResultLength} characters for <SearchBody> and ${options.maxLlmSummaryLength} characters for <SearchSummary>. Leave a small buffer as character counting is approximate.
5.  **CRITICAL - No Manual Citations:** Do not add source references (numbered citations, markdown links, URLs) in the content. The system handles source attribution automatically.
`);

    importantRules.push(`
6.  **Error Handling:** If the user's request is unclear even with context, conduct a comprehensive search addressing the most likely interpretations.
`);

    prompts.push(`
IMPORTANT RULES (Follow Strictly):
${importantRules.map((r) => r.trim()).join('\n')}
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

    // Entity performing the action context
    if (this.entity.type === EntityType.Agent) {
      const agent = this.entity as Agent;
      const agentContext = agent.context;

      contexts.push({
        type: 'text',
        text: `
Requesting agent context:
<RequestingAgentContext>
${AgentContext.FORMAT}
${agentContext.build()}
</RequestingAgentContext>
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

    return contexts;
  }

  public override build(
    options: {
      parameters?: string;
      maxLlmResultLength: number;
      maxLlmSummaryLength: number;
      timezone?: ValidatedTimezone;
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

    const contextContents = this.buildContext(options);
    const userQuery = options.parameters ?? '';

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `Web Search Request: "${userQuery}"

Read the following context with this search request in mind to identify relevant details that can enhance the search.`,
      },
      ...contextContents,
      {
        type: 'text',
        text: `Now conduct a web search for the request above: "${userQuery}"

Enhance the query using any relevant context you identified. Respond exclusively with the <SearchBody> and <SearchSummary> XML tags.`,
      },
    ];

    messages.push({
      role: 'user',
      content: GimmickInputBuilder.mergeMessageContents(userContents),
    });

    return messages;
  }
}
