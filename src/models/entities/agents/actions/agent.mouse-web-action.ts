import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentMouseWebActionType {
  MOVE = 'MOVE',
  CLICK_XY = 'CLICK_XY',
  CLICK_ELEMENT = 'CLICK_ELEMENT',
  CLICK_TEXT = 'CLICK_TEXT',
  DRAG = 'DRAG',
  SCROLL = 'SCROLL',
}

export enum AgentMouseWebClickType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  RIGHT = 'RIGHT',
}

export enum AgentMouseWebScrollDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  TOP = 'TOP',
  BOTTOM = 'BOTTOM',
}

export interface AgentMouseWebActionParameters {
  type: AgentMouseWebActionType;
  coordinates?: string;
  selector?: string;
  textContent?: string;
  direction?: AgentMouseWebScrollDirection;
  distance?: number;
  clickType?: AgentMouseWebClickType;
  waitAfter?: number;
}

@RegisterAgentAction('mouse_web')
export class AgentMouseWebAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Perform comprehensive mouse actions on web pages. MOVE moves cursor, CLICK_XY clicks at coordinates, CLICK_ELEMENT clicks using CSS selector, CLICK_TEXT clicks element containing text, DRAG performs drag-and-drop, SCROLL scrolls page in specified direction. Supports different click types (single, double, right) and flexible targeting (coordinates, selectors, text content). Use for all mouse interactions including clicking, dragging, and scrolling.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        const schema = z.object({
          type: z.nativeEnum(AgentMouseWebActionType),
          coordinates: z
            .string()
            .optional()
            .describe(
              'Coordinates: "x,y" for MOVE/CLICK_XY or "startX,startY,endX,endY" for DRAG'
            ),
          selector: z
            .string()
            .optional()
            .describe(
              'CSS selector for CLICK_ELEMENT (e.g., "#submit-btn", ".nav-link")'
            ),
          textContent: z
            .string()
            .optional()
            .describe('Text content for CLICK_TEXT (e.g., "Submit", "Log In")'),
          direction: z
            .nativeEnum(AgentMouseWebScrollDirection)
            .optional()
            .describe('Scroll direction for SCROLL action'),
          distance: z
            .number()
            .optional()
            .default(500)
            .describe('Scroll distance in pixels (default: 500)'),
          clickType: z
            .nativeEnum(AgentMouseWebClickType)
            .optional()
            .default(AgentMouseWebClickType.SINGLE)
            .describe('Click type: SINGLE (default), DOUBLE, or RIGHT'),
          waitAfter: z
            .number()
            .optional()
            .default(500)
            .describe(
              'Wait time after action in milliseconds (default: 500ms)'
            ),
        });

        return schema.refine(
          (data) => {
            switch (data.type) {
              case AgentMouseWebActionType.MOVE:
              case AgentMouseWebActionType.CLICK_XY:
                return data.coordinates !== undefined;
              case AgentMouseWebActionType.CLICK_ELEMENT:
                return data.selector !== undefined;
              case AgentMouseWebActionType.CLICK_TEXT:
                return data.textContent !== undefined;
              case AgentMouseWebActionType.DRAG:
                return data.coordinates !== undefined;
              case AgentMouseWebActionType.SCROLL:
                return data.direction !== undefined;
              default:
                return true;
            }
          },
          {
            message:
              'Required parameters missing for the specified action type',
          }
        );
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentMouseWebActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} performs mouse action: ${action.type}`
      );
    }

    let actionStr = `mouse_web --type ${action.type}`;

    if (action.coordinates) {
      actionStr += ` --coordinates "${action.coordinates}"`;
    }

    if (action.selector) {
      actionStr += ` --selector "${action.selector}"`;
    }

    if (action.textContent) {
      actionStr += ` --text-content "${action.textContent}"`;
    }

    if (action.direction) {
      actionStr += ` --direction ${action.direction}`;
    }

    if (action.distance && action.distance !== 500) {
      actionStr += ` --distance ${action.distance}`;
    }

    if (
      action.clickType &&
      action.clickType !== AgentMouseWebClickType.SINGLE
    ) {
      actionStr += ` --click-type ${action.clickType}`;
    }

    if (action.waitAfter && action.waitAfter !== 500) {
      actionStr += ` --wait-after ${action.waitAfter}`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionStr,
    });
  }
}
