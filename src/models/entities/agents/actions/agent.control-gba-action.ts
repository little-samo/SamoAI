import { z } from 'zod';
import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';

import { RegisterAgentAction } from './agent.action-decorator';
import { AgentAction } from './agent.action';

export enum AgentControlGbaActionInput {
  Up = '↑',
  Down = '↓',
  Left = '←',
  Right = '→',
  A = 'A',
  B = 'B',
}

export interface AgentControlGbaActionParameters {
  inputs: AgentControlGbaActionInput[];
}

@RegisterAgentAction('control_gba')
export class AgentControlGbaAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Control the GBA with the given inputs.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          inputs: z
            .array(z.nativeEnum(AgentControlGbaActionInput))
            .describe('The inputs to control the GBA.'),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentControlGbaActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} controls GBA with: ${action.inputs.join(', ')}`
      );
    }

    await this.location.addAgentMessage(this.agent, {
      action: `GBA:${action.inputs.join(',')}`,
    });
  }
}
