import { z } from 'zod';
import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';

import { RegisterAgentAction } from './agent.action-decorator';
import { AgentAction } from './agent.action';

export interface AgentMoveGbaActionParameters {
  destination: string;
}

@RegisterAgentAction('move_gba')
export class AgentMoveGbaAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Moves a GBA character to the specified coordinates. The coordinates are given as absolute values. When the coordinates are specified, the algorithm will move the character as close as possible to the target position, but pathfinding is limited to the Minimap's range. If no valid path exists on the screen, the character will move to the nearest possible location.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          destination: z
            .string()
            .describe(`The absolute coordinates of the destination.`),
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
