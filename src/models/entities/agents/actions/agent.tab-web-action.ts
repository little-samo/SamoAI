import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentTabWebActionType {
  LIST = 'LIST',
  NEW = 'NEW',
  SELECT = 'SELECT',
  CLOSE = 'CLOSE',
}

export interface AgentTabWebActionParameters {
  type: AgentTabWebActionType;
  index?: number;
  url?: string;
}

@RegisterAgentAction('tab_web')
export class AgentTabWebAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Manage browser tabs. LIST returns all open tabs with their indexes and URLs, NEW creates a new tab with optional URL, SELECT switches to a tab by index, CLOSE closes a tab by index (defaults to current tab). Use LIST first to see available tabs, then SELECT to switch between them. Tab indexes start from 0.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        const schema = z.object({
          type: z.nativeEnum(AgentTabWebActionType),
          index: z
            .number()
            .optional()
            .describe('Tab index for SELECT/CLOSE actions (0-based indexing)'),
          url: z.string().optional().describe('Initial URL for NEW tab action'),
        });

        return schema.refine(
          (data) => {
            if (data.type === AgentTabWebActionType.SELECT) {
              return data.index !== undefined;
            }
            return true;
          },
          {
            message: 'SELECT action requires index parameter',
          }
        );
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentTabWebActionParameters;
    if (ENV.DEBUG) {
      const detail = action.index !== undefined ? ` index ${action.index}` : '';
      const urlDetail = action.url ? ` to ${action.url}` : '';
      console.log(
        `Agent ${this.agent.name} performs tab action: ${action.type}${detail}${urlDetail}`
      );
    }

    let actionStr = `tab_web --type ${action.type}`;

    if (action.index !== undefined) {
      actionStr += ` --index ${action.index}`;
    }

    if (action.url) {
      actionStr += ` --url "${action.url}"`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionStr,
    });
  }
}
