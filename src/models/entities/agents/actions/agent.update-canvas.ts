import { AgentAction, LlmToolCall } from '@little-samo/samo-ai';
import { z } from 'zod';

import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentUpdateCanvasParameters {
  name: string;
  text: string;
}

@RegisterAgentAction('update_canvas')
export class AgentUpdateCanvas extends AgentAction {
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
          text: z
            .string()
            .describe(
              `The **entire new text content** for the canvas. **CRITICAL: Check the canvas's specific \`MAX_LENGTH\` in '<LocationCanvases>' context BEFORE generating text.** Text exceeding this specific limit **WILL BE TRUNCATED** upon execution. Content MUST be in English.`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentUpdateCanvasParameters;
    const { name, text } = action;

    await this.location.updateCanvas(
      this.agent.type,
      this.agent.id,
      name,
      text
    );
  }
}
