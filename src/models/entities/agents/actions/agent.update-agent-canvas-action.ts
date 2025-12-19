import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentUpdateAgentCanvasParameters {
  name: string;
  text: string;
}

@RegisterAgentAction('update_agent_canvas')
export class AgentUpdateAgentCanvasAction extends AgentAction {
  public override get description(): string {
    return `Overwrite private Agent Canvas.`;
  }

  public override get parameters(): z.ZodSchema {
    return z.object({
      name: z.string().describe('Canvas NAME from <YourCanvases>.'),
      text: z
        .string()
        .describe(`New content. Check MAX_LENGTH—exceeding truncates.`),
    });
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentUpdateAgentCanvasParameters;
    const { name, text } = action;

    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} updates agent canvas ${name} with text: ${text}`
      );
    }

    await this.agent.updateCanvas(name, text);
  }
}
