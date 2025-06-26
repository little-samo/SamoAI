import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentScrollWebActionDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  TOP = 'TOP',
  BOTTOM = 'BOTTOM',
}

export interface AgentScrollWebActionParameters {
  direction?: AgentScrollWebActionDirection;
  coordinates?: string;
  distance?: number;
}

@RegisterAgentAction('scroll_web')
export class AgentScrollWebAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Scroll the web page in the specified direction or to specific coordinates. Use direction for relative scrolling (UP, DOWN, LEFT, RIGHT, TOP, BOTTOM) or coordinates for absolute positioning. Distance parameter controls scroll amount for directional scrolling. Generally safe to use in control_web compound actions since scrolling is usually immediate. Use as standalone action when you need to scroll and wait to see if new content loads (infinite scroll, lazy loading) before performing additional actions.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          direction: z
            .nativeEnum(AgentScrollWebActionDirection)
            .optional()
            .describe(
              'Direction to scroll: UP, DOWN, LEFT, RIGHT for relative scrolling, or TOP, BOTTOM for absolute positioning'
            ),
          coordinates: z
            .string()
            .optional()
            .describe(
              'Specific coordinates to scroll to in "x,y" format (e.g., "0,500" to scroll to position x=0, y=500)'
            ),
          distance: z
            .number()
            .optional()
            .default(500)
            .describe(
              'Distance in pixels to scroll when using directional scrolling (default: 500)'
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentScrollWebActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} scrolls web page: ${action.direction || action.coordinates || 'unknown'}`
      );
    }

    // Build action string with parameters
    let actionStr = 'scroll_web';

    if (action.direction) {
      actionStr += ` --direction ${action.direction}`;
    }

    if (action.coordinates) {
      actionStr += ` --coordinates "${action.coordinates}"`;
    }

    if (action.distance && action.distance !== 500) {
      actionStr += ` --distance ${action.distance}`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionStr,
    });
  }
}
