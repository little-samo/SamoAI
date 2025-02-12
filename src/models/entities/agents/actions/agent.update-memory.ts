import { ENV } from '@common/config';
import { z } from 'zod';
import { LlmToolCall } from '@common/llms/llm.tool';

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
        return 'Update one of your memories.';
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
            .describe('The index of the memory to update.'),
          memory: z
            .string()
            .max(this.location.meta.messageLengthLimit)
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

    this.agent.state.memories[action.index] = action.memory;
    this.agent.state.dirty = true;
  }
}
