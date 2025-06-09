import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentUpdateCanvasParameters {
  name: string;
  reason: string;
  text: string;
}

@RegisterAgentAction('update_canvas')
export class AgentUpdateCanvasAction extends AgentAction {
  public static readonly type: string = 'update_canvas';

  public override get description(): string {
    return `Updates the text content of a specific **public Location Canvas** (found in '<LocationCanvases>'). This **overwrites** the entire existing text. Use according to the canvas's NAME/DESCRIPTION (e.g., for shared plans, notes). Be mindful that anyone in the location can see and modify these canvases. Content MUST be in English.`;
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          name: z
            .string()
            .describe(
              `The exact NAME of the public Location Canvas (from <LocationCanvases>) to update.`
            ),
          reason: z
            .string()
            .describe(
              'A reason for updating the canvas, which will be visible to other agents.'
            ),
          text: z
            .string()
            .describe(
              `The **entire new text content** for the canvas. **CRITICAL: Check the canvas's specific \`MAX_LENGTH\` in '<LocationCanvases>' context BEFORE generating text.** Text exceeding this specific limit **WILL BE TRUNCATED** upon execution.`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentUpdateCanvasParameters;
    const { name, text, reason } = action;

    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} updates location canvas ${name} with text: ${text}`
      );
    }

    await this.location.updateCanvas(
      this.agent.type,
      this.agent.id,
      name,
      text
    );
    await this.location.addAgentMessage(this.agent, {
      action: `update_canvas --name ${name} --reason ${JSON.stringify(reason)}`,
    });
  }
}
