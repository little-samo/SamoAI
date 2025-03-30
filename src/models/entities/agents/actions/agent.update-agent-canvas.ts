import { z } from 'zod';
import { AgentAction, LlmToolCall } from '@little-samo/samo-ai';

import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentUpdateAgentCanvasParameters {
  name: string;
  text: string;
}

@RegisterAgentAction('update_agent_canvas')
export class AgentUpdateAgentCanvas extends AgentAction {
  public override get description(): string {
    return `Updates the text content of one of **your private Agent Canvases** (found in '<YourCanvases>'). This **overwrites** the entire existing text. Use according to the canvas's NAME/DESCRIPTION (e.g., for personal notes, planning, drafting). Only you can view and modify these. Content MUST be in English.`;
  }

  public override get parameters(): z.ZodSchema {
    return z.object({
      name: z
        .string()
        .describe(
          'The exact NAME of your private Agent Canvas (from <YourCanvases>) to update.'
        ),
      text: z
        .string()
        .describe(
          `The **entire new text content** for the canvas. **CRITICAL: Check the canvas's specific \`MAX_LENGTH\` in '<YourCanvases>' context BEFORE generating text.** Text exceeding this specific limit **WILL BE TRUNCATED** upon execution. Content MUST be in English.`
        ),
    });
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentUpdateAgentCanvasParameters;
    const { name, text } = action;

    await this.agent.updateCanvas(name, text);
  }
}
