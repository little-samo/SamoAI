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
    switch (this.version) {
      case 1:
      default:
        return `Update OTHER entity's memory slot. NEVER use for yourself. Use 'type:numericId' key. English only.`;
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
            .describe(`Entity key (e.g. "user:123"). Use numeric ID.`),
          index: z
            .number()
            .min(0)
            .max(maxIndex)
            .describe(
              `Slot index (0-${maxIndex}). Overwrite least important if full.`
            ),
          memory: z
            .string()
            .max(maxLength)
            .describe(
              `Fact in English (max ${maxLength} chars). Empty string = clear.`
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
