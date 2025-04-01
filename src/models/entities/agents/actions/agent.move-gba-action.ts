import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentMoveGbaActionParameters {
  destination: string;
}

@RegisterAgentAction('move_gba')
export class AgentMoveGbaAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Efficiently moves the GBA character directly to the specified absolute coordinates ('x,y'). Use for significant distance travel in a single command, not for small step-by-step adjustments. The system handles pathfinding automatically`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          destination: z
            .string()
            .describe(
              `Target absolute coordinates ('x,y') for the character's final destination.`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentMoveGbaActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} moves GBA character to: ${action.destination}`
      );
    }

    await this.location.addAgentMessage(this.agent, {
      action: `MOVE_GBA:${action.destination}`,
    });
  }
}
