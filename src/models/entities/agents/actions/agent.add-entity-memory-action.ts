import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityKey } from '../../entity.types';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentAddEntityMemoryActionParameters {
  key: EntityKey;
  memory: string;
}

@RegisterAgentAction('add_entity_memory')
export class AgentAddEntityMemoryAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Proposes adding a new memory specifically about the entity identified by 'key'. This serves as a **suggestion** for the separate memory update process. Use this to flag significant facts, interactions, or observations related *only* to that entity based on the current interaction. For guidance on *what* constitutes good memory content, recall that memories should be concise, factual, and in English.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    const maxLength = this.agent.meta.entityMemoryLengthLimit;
    switch (this.version) {
      case 1:
      default:
        return z.object({
          key: z
            .string()
            .describe(
              `The unique key (e.g., 'user:123', 'agent:123') of the specific entity (User or Agent) whose memory slot you want to update.`
            ),
          memory: z
            .string()
            .max(maxLength)
            .describe(
              `The concise and factual new memory content specifically *about the entity identified by key*, **proposed** for storage. Max length: ${maxLength} characters. The memory content MUST be written in English, even if summarizing non-English information.`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentAddEntityMemoryActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} added memory for entity ${action.key} with value ${action.memory}`
      );
    }
  }
}
