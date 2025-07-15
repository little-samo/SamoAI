import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentNavigateWebActionType {
  GO = 'GO',
  BACK = 'BACK',
  FORWARD = 'FORWARD',
  REFRESH = 'REFRESH',
}

export interface AgentNavigateWebActionParameters {
  type: AgentNavigateWebActionType;
  destination?: string;
}

@RegisterAgentAction('navigate_web')
export class AgentNavigateWebAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Navigate the web browser. GO navigates to specified URL, BACK goes to previous page, FORWARD goes to next page, REFRESH reloads current page. Always use as standalone action since navigation requires waiting for page load completion. After navigation, wait for page to fully load before performing additional actions.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        const schema = z.object({
          type: z.nativeEnum(AgentNavigateWebActionType),
          destination: z
            .string()
            .optional()
            .describe(
              'Target URL or path for GO action (e.g., "https://example.com", "/login")'
            ),
        });

        return schema.refine(
          (data) => {
            if (data.type === AgentNavigateWebActionType.GO) {
              return data.destination !== undefined;
            }
            return true;
          },
          {
            message: 'GO action requires destination parameter',
          }
        );
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentNavigateWebActionParameters;
    if (ENV.DEBUG) {
      const detail = action.destination ? ` to ${action.destination}` : '';
      console.log(
        `Agent ${this.agent.name} navigates: ${action.type}${detail}`
      );
    }

    let actionStr = `navigate_web --type ${action.type}`;

    if (action.destination) {
      actionStr += ` --destination "${action.destination}"`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionStr,
    });
  }
}
