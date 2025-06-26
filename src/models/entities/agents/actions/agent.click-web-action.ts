import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentClickWebActionType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  RIGHT = 'RIGHT',
}

export interface AgentClickWebActionParameters {
  selector?: string;
  coordinates?: string;
  clickType?: AgentClickWebActionType;
  waitAfter?: number;
}

@RegisterAgentAction('click_web')
export class AgentClickWebAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Click on web page elements using CSS selector or coordinates. Use selector for element-based clicking (e.g., buttons, links) or coordinates for position-based clicking. Supports single click, double click, and right click. Optional wait time after clicking for page loading. RECOMMENDED for actions that might trigger page changes, form submissions, navigation, or AJAX requests where you need to wait for the result before proceeding with additional actions. Use this instead of control_web when the click might cause asynchronous page updates.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          selector: z
            .string()
            .optional()
            .describe(
              'CSS selector to target specific element (e.g., "#submit-btn", ".nav-link", "button[type=submit]")'
            ),
          coordinates: z
            .string()
            .optional()
            .describe(
              'Coordinates in "x,y" format for position-based clicking (e.g., "100,200")'
            ),
          clickType: z
            .nativeEnum(AgentClickWebActionType)
            .optional()
            .default(AgentClickWebActionType.SINGLE)
            .describe('Type of click: SINGLE (default), DOUBLE, or RIGHT'),
          waitAfter: z
            .number()
            .optional()
            .default(1000)
            .describe(
              'Time in milliseconds to wait after clicking (default: 1000ms)'
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentClickWebActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} clicks web element: ${action.selector || action.coordinates || 'unknown target'}`
      );
    }

    // Build action string with parameters
    let actionStr = 'click_web';

    if (action.selector) {
      actionStr += ` --selector "${action.selector}"`;
    }

    if (action.coordinates) {
      actionStr += ` --coordinates "${action.coordinates}"`;
    }

    if (
      action.clickType &&
      action.clickType !== AgentClickWebActionType.SINGLE
    ) {
      actionStr += ` --click-type ${action.clickType}`;
    }

    if (action.waitAfter && action.waitAfter !== 1000) {
      actionStr += ` --wait-after ${action.waitAfter}`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionStr,
    });
  }
}
