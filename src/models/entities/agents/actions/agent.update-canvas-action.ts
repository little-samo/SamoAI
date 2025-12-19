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
  public static readonly ACTION_TEXT_DISPLAY_MAX_LENGTH = 500;

  public override get description(): string {
    return `Overwrite entire Location Canvas. For minor edits, use \`edit_canvas\` instead.`;
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          name: z.string().describe(`Canvas NAME from <LocationCanvases>.`),
          reason: z.string().describe('Reason for update (visible to others).'),
          text: z
            .string()
            .describe(`New content. Check MAX_LENGTH—exceeding truncates.`),
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

    const textDisplay =
      text.length > AgentUpdateCanvasAction.ACTION_TEXT_DISPLAY_MAX_LENGTH
        ? JSON.stringify(
            text.substring(
              0,
              AgentUpdateCanvasAction.ACTION_TEXT_DISPLAY_MAX_LENGTH - 3
            ) + '...'
          )
        : JSON.stringify(text);

    await this.location.addAgentMessage(this.agent, {
      action: `update_canvas --name ${name} --text ${textDisplay} --reason ${JSON.stringify(reason)}`,
    });

    await this.location.updateCanvas(
      this.agent.type,
      this.agent.id,
      name,
      text,
      reason
    );
  }
}
