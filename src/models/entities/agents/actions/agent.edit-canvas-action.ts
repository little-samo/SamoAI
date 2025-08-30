import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentEditCanvasParameters {
  name: string;
  reason: string;
  existing_content: string;
  new_content: string;
}

@RegisterAgentAction('edit_canvas')
export class AgentEditCanvasAction extends AgentAction {
  public static readonly ACTION_TEXT_DISPLAY_MAX_LENGTH = 50;

  private static formatContentForDisplay(content: string): string {
    if (
      content.length <= AgentEditCanvasAction.ACTION_TEXT_DISPLAY_MAX_LENGTH
    ) {
      return JSON.stringify(content);
    }
    const truncated =
      content.substring(
        0,
        AgentEditCanvasAction.ACTION_TEXT_DISPLAY_MAX_LENGTH - 3
      ) + '...';
    return JSON.stringify(truncated);
  }

  public override get description(): string {
    return `Edits a specific portion of a **public Location Canvas** (found in '<LocationCanvases>') by replacing existing content with new content, or by appending new content. This is useful for making targeted changes or additions without overwriting the entire canvas. Use this for minor edits. For major revisions, use \`update_canvas\`. Be mindful that anyone in the location can see and modify these canvases.`;
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          name: z
            .string()
            .describe(
              `The exact NAME of the public Location Canvas (from <LocationCanvases>) to edit.`
            ),
          reason: z
            .string()
            .describe(
              'A reason for editing the canvas, which will be visible to other agents.'
            ),
          existing_content: z
            .string()
            .describe(
              `The exact existing text content to find and replace. Must match exactly (case-sensitive). If empty, the new content will be appended to the canvas.`
            ),
          new_content: z
            .string()
            .describe(
              `The new content to replace the existing content with. **CRITICAL: Ensure the total canvas length after editing does not exceed the canvas's specific \`MAX_LENGTH\` in '<LocationCanvases>' context.**`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentEditCanvasParameters;
    const { name, existing_content, new_content, reason } = action;

    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} edits location canvas ${name}: replacing "${existing_content}" with "${new_content}"`
      );
    }

    // Create detailed action message showing the edit
    const newContentDisplay =
      AgentEditCanvasAction.formatContentForDisplay(new_content);
    const reasonJson = JSON.stringify(reason);

    // Build action message based on whether we're appending or replacing
    let actionMessage: string;
    if (!existing_content) {
      actionMessage = `edit_canvas --name ${name} --append ${newContentDisplay} --reason ${reasonJson}`;
    } else {
      const existingContentDisplay =
        AgentEditCanvasAction.formatContentForDisplay(existing_content);
      actionMessage = `edit_canvas --name ${name} --from ${existingContentDisplay} --to ${newContentDisplay} --reason ${reasonJson}`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionMessage,
    });

    const success = await this.location.editCanvas(
      this.agent.type,
      this.agent.id,
      name,
      existing_content,
      new_content,
      reason
    );

    if (!success) {
      await this.location.addSystemMessage(
        `Agent ${this.agent.name} failed to edit canvas "${name}": existing content not found`
      );
    }
  }
}
