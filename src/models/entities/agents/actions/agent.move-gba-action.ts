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
        return `Move GBA character to 'x,y' coordinates.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          destination: z.string().describe(`Target 'x,y' coordinates.`),
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
      action: `move_gba --destination "${action.destination}"`,
    });
  }
}
