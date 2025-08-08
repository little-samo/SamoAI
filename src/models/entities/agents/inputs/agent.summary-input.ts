import type {
  LlmMessage,
  LlmMessageContent,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { AgentInputBuilder } from './agent.input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('summary')
export class AgentSummaryInputBuilder extends AgentInputBuilder {
  public override build(options: {
    prevSummary: string;
    inputMessages: LlmMessage[];
    toolCalls: LlmToolCall[];
  }): LlmMessage[] {
    const { prevSummary, inputMessages, toolCalls } = options;
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

1.  **Synthesize, Condense & ISO 8601 date strings (CRITICAL):** Create a ***highly condensed***, coherent narrative integrating the *most relevant points* from the \`<CurrentSummary>\` with the *significant happenings* revealed in the \`<Input>\` and \`<Output>\` of the current turn. The new summary *replaces* the old one. **Incorporate relevant **ISO 8601 date strings** (e.g., \`(time: '2025-04-19T10:00:00.000Z')\`) for key events** where available in the \`<Input>\` or \`<Output>\` (like messages, memory updates, or significant observations). Extract date strings directly associated with the events being summarized.
2.  **Focus on Cross-Location Contextual Significance:** Prioritize information vital for understanding the ongoing situation, agent's state, user intentions, relationships, and unresolved tasks/goals **specifically if the agent were to revisit this Location after being active in others.** Ask: "What core facts (with date strings) from *this* turn in *this* Location must the agent remember to function effectively upon return?"
3.  **Capture Key Interactions & Decisions:** Include *only the most important* user requests, agent responses, significant agent observations (from reasoning), confirmations, agreements, disagreements, or pivotal conversation moments relevant to the ongoing state *within the current Location*, **always adding date strings.**
4.  **Note State Changes & Location (CRITICAL):** Mention critical changes (users entering/leaving, item transfers, key memory/canvas updates) impacting local context. **Crucially, ALL new information added MUST be clearly associated with the specific Location** using the format \`LOCATION_NAME (LOCATION_KEY)\` (e.g., \`Private Chat (location:123)\`). Find details in \`<Input>\`'s \`<Location>\` block. Prefixing entries is required, e.g., \`[Private Chat (location:123)] User user:456(Lucid) asked...(time:...)\`. **Include date strings for these state changes.**
5.  **Prioritize Recency & Strict Limit (ABSOLUTELY CRITICAL):** Brevity is paramount. **The summary MUST STRICTLY ADHERE to a MAXIMUM limit of ${this.agent.meta.summaryLengthLimit} characters.**
    *   **Prioritization Strategy:** When synthesizing, and especially **when approaching the ${this.agent.meta.summaryLengthLimit}-character limit, prioritize summarizing the *current turn's key events (with date strings)* and integrating them with the *most recent and contextually vital points* from the \`<CurrentSummary>\`.**
    *   **Trimming:** Less critical or significantly older information from the \`<CurrentSummary>\` **must be condensed further or omitted entirely** if necessary to stay within the ${this.agent.meta.summaryLengthLimit}-character limit. The goal is to ensure the *latest interactions are always preserved*, even at the cost of older details.
    *   **Warning:** Do NOT exceed ${this.agent.meta.summaryLengthLimit} characters. **Exceeding the limit WILL result in truncation and CRITICAL LOSS of recent context.** Edit ruthlessly.
6.  **Maintain Neutrality and Factuality:** Report events objectively based *only* on the provided data for *this* turn in *this* Location. Do not add interpretations or predictions.
7.  **Reference Entities Clearly:** Use the \`type:id(name)\` format (e.g., \`user:123(Alice)\`, \`agent:45(Bob)\`) consistently when referring to specific entities in the summary. Also remember the Location \`NAME (KEY)\` format (Summary Rule #4) and ISO 8601 Date Strings (Summary Rule #1).
8.  **Language (CRITICAL):** The summary MUST be written entirely in **English**.
9.  **Output Format (CRITICAL):** Provide *only* the raw text of the new summary. No introductions, markdown, apologies, etc. **Crucially, ensure the final output rigorously adheres to the ${this.agent.meta.summaryLengthLimit}-character maximum (Summary Rule #5), includes Location identifiers (Summary Rule #4), uses the correct entity format (Summary Rule #7), and incorporates ISO 8601 Date Strings (Summary Rule #1). Double-check length before finalizing.**
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

The context the agent received:
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

The agent's tool calls performed by the agent assistant:
<Output>
${JSON.stringify(toolCalls, null, 2)}
</Output>

<CurrentSummary>
${prevSummary}
</CurrentSummary>
  `,
    });

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `Follow the rules in the system prompt. Analyze the following context and generate an updated, concise summary of the agent's turn.`,
      },
      ...AgentInputBuilder.mergeMessageContents(contextContents, '\n'),
      {
        type: 'text',
        text: `
Now, provide the new summary, strictly following all rules.

**Reminder of Critical Rules:**
1.  **Length Limit:** ABSOLUTELY NO MORE than ${this.agent.meta.summaryLengthLimit} characters.
2.  **Location Tagging:** Prefix all new information with \`LOCATION_NAME (LOCATION_KEY)\`.
3.  **Timestamps:** Include relevant ISO 8601 date strings for key events.
4.  **Output Format:** Provide ONLY the raw summary text. No other text or markdown.
`,
      },
    ];

    messages.push({
      role: 'user',
      content: userContents,
    });

    return messages;
  }
}
