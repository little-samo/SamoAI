import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentAddMemoryActionParameters {
  memory: string;
}

@RegisterAgentAction('add_memory')
export class AgentAddMemoryAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Propose a general memory (cross-location). For essential facts only.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          memory: z
            .string()
            .max(this.agent.meta.memoryLengthLimit)
            .describe(
              `Concise fact in English (max ${this.agent.meta.memoryLengthLimit} chars).`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentAddMemoryActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} added memory with value ${action.memory}`
      );
    }
  }
}
