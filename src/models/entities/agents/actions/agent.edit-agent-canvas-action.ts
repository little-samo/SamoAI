import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentEditAgentCanvasParameters {
  name: string;
  existing_content: string;
  new_content: string;
}

@RegisterAgentAction('edit_agent_canvas')
export class AgentEditAgentCanvasAction extends AgentAction {
  public static readonly ACTION_TEXT_DISPLAY_MAX_LENGTH = 50;

  public override get description(): string {
    return `Edits a specific portion of one of **your private Agent Canvases** (found in '<YourCanvases>') by replacing existing content with new content, or by appending new content. This is useful for making targeted changes or additions without overwriting the entire canvas. Use this for minor edits. For major revisions, use \`update_agent_canvas\`. Only you can view and modify these canvases.`;
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          name: z
            .string()
            .describe(
              `The exact NAME of your private Agent Canvas (from <YourCanvases>) to edit.`
            ),
          existing_content: z
            .string()
            .describe(
              `The exact existing text content to find and replace. Must match exactly (case-sensitive). If empty, the new content will be appended to the canvas.`
            ),
          new_content: z
            .string()
            .describe(
              `The new content to replace the existing content with. **CRITICAL: Ensure the total canvas length after editing does not exceed the canvas's specific \`MAX_LENGTH\` in '<YourCanvases>' context.**`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentEditAgentCanvasParameters;
    const { name, existing_content, new_content } = action;

    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} edits agent canvas ${name}: replacing "${existing_content}" with "${new_content}"`
      );
    }

    const success = await this.agent.editCanvas(
      name,
      existing_content,
      new_content
    );

    if (!success) {
      // For private agent canvases, we don't add a system message as it's private
      // The agent will not receive immediate feedback about the failure
      if (ENV.DEBUG) {
        console.log(
          `Agent ${this.agent.name} failed to edit agent canvas: existing content not found`
        );
      }
      return;
    }

    if (ENV.DEBUG) {
      // Create detailed action message showing the edit for debugging
      const existingContentDisplay = !existing_content
        ? '[APPEND]'
        : existing_content.length >
            AgentEditAgentCanvasAction.ACTION_TEXT_DISPLAY_MAX_LENGTH
          ? JSON.stringify(
              existing_content.substring(
                0,
                AgentEditAgentCanvasAction.ACTION_TEXT_DISPLAY_MAX_LENGTH - 3
              ) + '...'
            )
          : JSON.stringify(existing_content);

      const newContentDisplay =
        new_content.length >
        AgentEditAgentCanvasAction.ACTION_TEXT_DISPLAY_MAX_LENGTH
          ? JSON.stringify(
              new_content.substring(
                0,
                AgentEditAgentCanvasAction.ACTION_TEXT_DISPLAY_MAX_LENGTH - 3
              ) + '...'
            )
          : JSON.stringify(new_content);

      console.log(
        `Agent ${this.agent.name} successfully edited agent canvas ${name}: ${existingContentDisplay} -> ${newContentDisplay}`
      );
    }
  }
}
