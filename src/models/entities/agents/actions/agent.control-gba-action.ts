import { z } from 'zod';
import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';

import { RegisterAgentAction } from './agent.action-decorator';
import { AgentAction } from './agent.action';

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
        return 'Control the GBA with the given inputs. Available inputs: Up, Down, Left, Right, A, B, START, SELECT. You can input up to 8 keys sequentially at once, and for efficiency, try to input as many as possible at once. Note that this tool can only be used once per response. Additionally, if you input any key other than the directional keys, the input will end.';
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
            .describe(
              `The inputs to control the GBA. Each input represents a single key press and they will be executed sequentially in the order provided. Max length: ${maxInputs} inputs.`
            ),
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

    const inputs = [];
    for (const input of action.inputs.slice(0, 4)) {
      inputs.push(input);
      if (
        input === AgentControlGbaActionInput.A ||
        input === AgentControlGbaActionInput.B ||
        input === AgentControlGbaActionInput.START ||
        input === AgentControlGbaActionInput.SELECT
      ) {
        break;
      }
    }

    await this.location.addAgentMessage(this.agent, {
      action: `CONTROL_GBA:${inputs.join(',')}`,
    });
  }
}
