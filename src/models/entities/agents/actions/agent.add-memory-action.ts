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
        return `Proposes adding a new memory to your general memory list. This serves as a **suggestion** for the separate memory update process. Use this to flag new essential information or potential corrections to outdated facts based on the current interaction. For guidance on *what* constitutes good memory content, recall that memories should be concise, factual, and in English.`;
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
              `The concise and factual memory content **proposed** for storage. Max length: ${this.agent.meta.memoryLengthLimit} characters. The memory content MUST be written in English, even if summarizing non-English information.`
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
