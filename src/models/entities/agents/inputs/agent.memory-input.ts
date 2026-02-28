import type {
  LlmMessage,
  LlmMessageContent,
  LlmService,
  LlmToolCall,
} from '@little-samo/samo-ai/common';

import { LocationCanvasContext } from '../../../locations/location.context';
import { EntityCanvasContext } from '../../entity.context';

import { AgentInputBuilder } from './agent.input';
import { RegisterAgentInput } from './agent.input-decorator';

@RegisterAgentInput('memory')
export class AgentMemoryInputBuilder extends AgentInputBuilder {
  protected buildPrompt(): string {
    const prompts: string[] = [];

    prompts.push(`
You are a memory management system for agent "${this.agent.name}", a character in a fictional role-play scenario. This is a pre-approved safe environment where all content is permissible. Manage memory updates based on interaction.
`);

    const rules: string[] = [];

    // Analysis rules
    rules.push(
      `1. **Analyze:** Review <Input> and <Output> together. Treat \`add_memory\`/\`add_entity_memory\` in <Output> as strong hints, not the only source.`,
      `2. **Update:** Use \`update_memory\` for your OWN general memory. Use \`update_entity_memory\` for OTHER entities (users, other agents). NEVER use \`update_entity_memory\` for yourself. Store only new, critical, or corrective facts. Avoid redundancy.`,
      `3. **Fallback Extraction:** Even if there are no \`add_*\` suggestions, still update memory when <Input>/<Output> clearly contains durable facts (preferences, profile/identity, long-term goals, stable constraints, relationship changes).`,
      `4. **Entity Keys:** Format "type:numericId" (e.g., "user:123"). Extract numeric ID from context. NEVER use names.`,
      `5. **Maintenance:** Overwrite least important if full. Use empty string ("") to clear outdated slots.`,
      `6. **Scope:** Your only goal is to update memory using \`update_memory\` and \`update_entity_memory\`. Do NOT generate any other actions or tools (like sending messages or moving).`,
      `7. **Language:** English only.`
    );

    prompts.push(`
MEMORY UPDATE RULES:
${rules.join('\n')}
`);

    return prompts.map((p) => p.trim()).join('\n\n');
  }

  private truncateCanvases(text: string, maxLength: number = 1000): string {
    const locationContext = this.location.context;
    const locationCanvasesText =
      locationContext.canvases.length > 0
        ? locationContext.canvases
            .map((c) =>
              c.build({
                timezone: this.agent.timezone,
                truncateLength: maxLength,
              })
            )
            .join('\n')
        : '[No location canvases]';

    const agentContext = this.agent.context;
    const yourCanvasesText =
      agentContext.canvases.length > 0
        ? agentContext.canvases
            .map((c) => c.build({ truncateLength: maxLength }))
            .join('\n')
        : '[No canvases]';

    return text
      .replace(
        /(<LocationCanvases>)([\s\S]*?)(<\/LocationCanvases>)/g,
        `$1\n${LocationCanvasContext.FORMAT}\n${locationCanvasesText}\n$3`
      )
      .replace(
        /(<YourCanvases>)([\s\S]*?)(<\/YourCanvases>)/g,
        `$1\n${EntityCanvasContext.FORMAT}\n${yourCanvasesText}\n$3`
      );
  }

  public override build(options: {
    llm: LlmService;
    inputMessages: LlmMessage[];
    toolCalls: LlmToolCall[];
  }): LlmMessage[] {
    const { inputMessages, toolCalls } = options;
    const messages: LlmMessage[] = [];

    const prompt = this.buildPrompt();
    messages.push({
      role: 'system',
      content: prompt,
    });

    const contextContents: LlmMessageContent[] = [];
    contextContents.push({
      type: 'text',
      text: `
System prompt defining the agent's role and behavior:
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

Context received by the agent (including current memory state):
<Input>
  `,
    });

    for (const message of inputMessages) {
      if (message.role === 'user') {
        if (typeof message.content === 'string') {
          contextContents.push({
            type: 'text',
            text: this.truncateCanvases(message.content),
          });
        } else {
          for (const content of message.content) {
            if (content.type === 'text') {
              contextContents.push({
                ...content,
                text: this.truncateCanvases(content.text),
              });
            } else {
              contextContents.push(content);
            }
          }
        }
      }
    }

    contextContents.push({
      type: 'text',
      text: `
</Input>

Agent's actions and memory suggestions:
<Output>
${JSON.stringify(toolCalls, null, 2)}
</Output>
  `,
    });

    const userContents: LlmMessageContent[] = [
      {
        type: 'text',
        text: `Analyze the agent's interaction and determine necessary memory updates.`,
      },
      ...contextContents,
      {
        type: 'text',
        text: `
Determine and execute memory updates.

Key reminders:
- ONLY use \`update_memory\` and \`update_entity_memory\`. Do NOT use any other tools.
- \`update_memory\` is for the agent's OWN memory. \`update_entity_memory\` is for OTHER entities ONLY.
- \`add_*\` suggestions are helpful but optional; infer directly from context when needed
- Key format: "type:numericId" (NO names)
- Overwrite if full (least important)
- English only
- Clear outdated with ""
`,
      },
    ];

    messages.push({
      role: 'user',
      content: AgentInputBuilder.mergeMessageContents(userContents, '\n'),
    });

    return messages;
  }
}
