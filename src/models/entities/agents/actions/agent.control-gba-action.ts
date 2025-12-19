import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentControlGbaActionInput {
  Up = 'Up',
  Down = 'Down',
  Left = 'Left',
  Right = 'Right',
  A = 'A',
  B = 'B',
  START = 'START',
  SELECT = 'SELECT',
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
        return 'Control GBA inputs (max 4). Once per turn.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        const maxInputs = 4;
        return z.object({
          inputs: z
            .array(z.nativeEnum(AgentControlGbaActionInput))
            .min(1)
            .max(maxInputs)
            .describe(`Sequential inputs (max ${maxInputs}).`),
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
      action: `control_gba --inputs ${action.inputs.slice(0, 4).join(',')}`,
    });
  }
}
