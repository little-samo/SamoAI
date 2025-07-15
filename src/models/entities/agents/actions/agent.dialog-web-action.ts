import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentDialogWebActionType {
  ACCEPT = 'ACCEPT',
  DISMISS = 'DISMISS',
}

export interface AgentDialogWebActionParameters {
  type: AgentDialogWebActionType;
  text?: string;
}

@RegisterAgentAction('dialog_web')
export class AgentDialogWebAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Handle browser dialog boxes (alert, confirm, prompt). ACCEPT confirms or accepts the dialog, DISMISS cancels or dismisses it. For prompt dialogs, provide text parameter with the response. Use this when JavaScript dialogs appear on the page that need user interaction.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          type: z.nativeEnum(AgentDialogWebActionType),
          text: z
            .string()
            .optional()
            .describe('Response text for prompt dialogs when using ACCEPT'),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentDialogWebActionParameters;
    if (ENV.DEBUG) {
      const textDetail = action.text ? ` with text "${action.text}"` : '';
      console.log(
        `Agent ${this.agent.name} handles dialog: ${action.type}${textDetail}`
      );
    }

    let actionStr = `dialog_web --type ${action.type}`;

    if (action.text) {
      actionStr += ` --text "${action.text}"`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionStr,
    });
  }
}
