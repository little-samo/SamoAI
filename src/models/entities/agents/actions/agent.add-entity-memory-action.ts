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
        return `Proposes adding a memory about a specific entity. This is a SUGGESTION for the separate memory update process. Use to flag significant facts, interactions, or observations related ONLY to that entity from current interaction. Memories should be concise, factual, and in English. CRITICAL: 'key' format is "type:id" with NUMERIC id (e.g., "user:123" or "agent:456"), NOT "user:@name".`;
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
              `Entity key in format "type:id" where id is a NUMBER. Examples: "user:123", "agent:456". NEVER use format like "user:@name". Extract numeric id from context (e.g., from KEY field).`
            ),
          memory: z
            .string()
            .max(maxLength)
            .describe(
              `Concise, factual memory about this entity only, proposed for storage. Max ${maxLength} chars. MUST be in English, even if summarizing non-English info.`
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
