import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

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
        return `Update general memory slot. Use empty string to clear. English only.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    const maxIndex = this.agent.meta.memoryLimit - 1;
    switch (this.version) {
      case 1:
      default:
        return z.object({
          index: z
            .number()
            .min(0)
            .max(maxIndex)
            .describe(
              `Slot index (0-${maxIndex}). Overwrite least important if full.`
            ),
          memory: z
            .string()
            .max(this.agent.meta.memoryLengthLimit)
            .describe(
              `Fact in English (max ${this.agent.meta.memoryLengthLimit} chars). Empty string = clear.`
            ),
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
