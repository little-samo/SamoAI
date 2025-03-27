import { z } from 'zod';
import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';

import { EntityKey } from '../../entity.types';

import { RegisterAgentAction } from './agent.action-decorator';
import { AgentAction } from './agent.action';

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
        return `Updates or overwrites a memory slot specifically about the entity identified by 'key' (indexed 0 to ${maxIndex}). Use this to store significant facts, interactions, or observations related *only* to that entity. Choose the index carefully based on importance and timeliness. Refer to CRITICAL memory rules for detailed guidance.`;
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
              `The unique key (e.g., 'user:123', 'agent:123') of the specific entity (User or Agent) whose memory slot you want to update.`
            ),
          index: z
            .number()
            .min(0)
            .max(maxIndex)
            .describe(
              `The index (0 to ${maxIndex}) of the memory slot *for the specified entity* to update. If all slots for this entity are full, choose the index of the least important or most outdated memory *for this entity* to overwrite.`
            ),
          memory: z
            .string()
            .max(maxLength)
            .describe(
              `The concise and factual new memory content specifically *about the entity identified by key*, to store at the specified index. Max length: ${maxLength} characters.`
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
