import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityKey } from '../../entity.types';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentUpdateEntityMemoryActionParameters {
  key: EntityKey;
  index: number;
  memory: string;
}

@RegisterAgentAction('update_entity_memory')
export class AgentUpdateEntityMemoryAction extends AgentAction {
  public override get description(): string {
    const maxIndex = this.agent.meta.entityMemoryLimit - 1;
    switch (this.version) {
      case 1:
      default:
        return `Updates or overwrites a memory slot about a specific entity (indexed 0-${maxIndex}). Use this to store significant facts, interactions, or observations related ONLY to that entity. Incorporates new/corrected information (potentially from 'add_entity_memory' suggestions) or clears outdated facts. To clear a slot, provide empty string ('') as memory value. Choose index carefully (overwrite least relevant for this entity if full). Memories must be concise, factual, and in English. CRITICAL: 'key' format is "type:id" with NUMERIC id (e.g., "user:123" or "agent:456"), NOT "user:@name".`;
    }
  }

  public override get parameters(): z.ZodSchema {
    const maxIndex = this.agent.meta.entityMemoryLimit - 1;
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
          index: z
            .number()
            .min(0)
            .max(maxIndex)
            .describe(
              `Index (0-${maxIndex}) of memory slot for this entity. If all slots full, choose least important or most outdated for this entity to overwrite.`
            ),
          memory: z
            .string()
            .max(maxLength)
            .describe(
              `Concise, factual memory about this entity only. Max ${maxLength} chars. MUST be in English. Use empty string ('') to clear/delete slot.`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentUpdateEntityMemoryActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} updated memory at ${action.key} index ${action.index} with value ${action.memory}`
      );
    }

    await this.agent.setEntityMemory(action.key, action.index, action.memory);
  }
}
