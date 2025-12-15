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
        return `Updates or overwrites a general memory slot (indexed 0-${this.agent.meta.memoryLimit - 1}). Use this to incorporate new/corrected information (potentially based on 'add_memory' suggestions) or clear outdated facts. To clear a slot, provide empty string ('') as memory value. Choose index carefully based on importance and timeliness (overwrite least relevant if full). Memories must be concise, factual, and in English.`;
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
              `Index (0-${maxIndex}) of the memory slot to update. If full, choose least important or most outdated to overwrite.`
            ),
          memory: z
            .string()
            .max(this.agent.meta.memoryLengthLimit)
            .describe(
              `Concise, factual memory content. Max ${this.agent.meta.memoryLengthLimit} chars. MUST be in English. Use empty string ('') to clear/delete slot.`
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
