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
        return `Proposes adding a memory to your general memory list. This is a SUGGESTION for the separate memory update process. Use to flag new essential information or corrections to outdated facts from current interaction. Memories should be concise, factual, and in English.`;
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
              `Concise, factual memory content proposed for storage. Max ${this.agent.meta.memoryLengthLimit} chars. MUST be in English, even if summarizing non-English info.`
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
