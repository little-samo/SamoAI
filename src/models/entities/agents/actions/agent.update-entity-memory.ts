import { ENV } from '@common/config';
import { z } from 'zod';
import { LlmToolCall } from '@common/llms/llm.tool';
import { EntityKey } from '@models/entities/entity';

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
    switch (this.version) {
      case 1:
      default:
        return 'Update one of your memory about an entity. If you select an index that already has a recorded memory, it will be overwritten. Choose the index carefully, considering the priority of the stored memory.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          key: z.string().describe('The key of the entity to update.'),
          index: z
            .number()
            .min(0)
            .max(this.agent.meta.entityMemoryLimit - 1)
            .describe('The index of the memory to update.'),
          memory: z
            .string()
            .max(this.agent.meta.entityMemoryLengthLimit)
            .describe('The new memory value.'),
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

    const entityState = this.agent.getEntityState(action.key);
    if (!entityState) {
      throw new Error(`Entity with key ${action.key} not found`);
    }
    entityState.memories[action.index] = action.memory;
    entityState.dirty = true;
  }
}
