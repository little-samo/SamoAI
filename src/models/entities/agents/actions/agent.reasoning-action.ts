import { z } from 'zod';
import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';

import { RegisterAgentAction } from './agent.action-decorator';
import { AgentAction } from './agent.action';

export interface AgentReasoningActionParameters {
  reasoning: string;
}

@RegisterAgentAction('reasoning')
export class AgentReasoningAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Uses CoT (Chain of Thought) to analyze the given input and rules, plan the next actions, and determine which tools to use in the current response. When necessary, it references and quotes relevant rules or inputs to ensure accurate decision-making.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          reasoning: z
            .string()
            .min(1)
            .max(1000)
            .describe(
              'The reasoning for the given objective. Provide reasoning for each step and cite sources.'
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentReasoningActionParameters;
    if (ENV.DEBUG) {
      console.log(`Agent ${this.agent.name} reasoning: ${action.reasoning}`);
    }
  }
}
