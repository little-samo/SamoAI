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
        return `Updates or overwrites a specific memory slot in your general memory list (indexed 0 to ${this.agent.meta.memoryLimit - 1}). Use this to store new essential information or correct outdated facts. Choose the index carefully based on importance and timeliness. Refer to CRITICAL memory rules for detailed guidance.`;
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
              `The index (0 to ${maxIndex}) of the general memory slot to update. If memory is full, choose the index of the least important or most outdated memory to overwrite.`
            ),
          memory: z
            .string()
            .max(this.agent.meta.memoryLengthLimit)
            .describe(
              `The concise and factual new memory content to store at the specified index. Max length: ${this.agent.meta.memoryLengthLimit} characters. The memory content MUST be written in English, even if summarizing non-English information.`
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
