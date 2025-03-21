import { z } from 'zod';
import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';

import { RegisterAgentAction } from './agent.action-decorator';
import { AgentAction } from './agent.action';

export interface AgentUpdateMemoryActionParameters {
  index: number;
  memory: string;
}

@RegisterAgentAction('update_memory')
export class AgentUpdateMemoryAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Update one of your memory. If you select an index that already has a recorded memory, it will be overwritten. If a stored situation in memory has changed or the issue has been resolved, overwrite the relevant memory to prevent future confusion. Choose the index carefully, considering the priority of the stored memory. If the memory pertains to a specific User or Agent, use a entity memory entry for that entity whenever possible. Otherwise, store the memory using the type:id(name) like "user:123(John Doe)" format to ensure accuracy.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          index: z
            .number()
            .min(0)
            .max(this.agent.meta.memoryLimit - 1)
            .describe(
              'The index of the memory to update. If memory becomes full, overwrite the least important memory.'
            ),
          memory: z
            .string()
            .max(this.agent.meta.memoryLengthLimit)
            .describe('The new memory value.'),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentUpdateMemoryActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} updated memory at index ${action.index} with value ${action.memory}`
      );
    }

    await this.agent.setMemory(action.index, action.memory);
  }
}
