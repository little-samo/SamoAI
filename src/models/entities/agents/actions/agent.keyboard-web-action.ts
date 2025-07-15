import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentKeyboardWebActionType {
  PRESS_KEY = 'PRESS_KEY',
  TYPE_TEXT = 'TYPE_TEXT',
  TYPE_IN_ELEMENT = 'TYPE_IN_ELEMENT',
}

export enum AgentKeyboardWebActionMode {
  REPLACE = 'REPLACE',
  APPEND = 'APPEND',
  CLEAR = 'CLEAR',
}

export interface AgentKeyboardWebActionParameters {
  type: AgentKeyboardWebActionType;
  key?: string;
  text?: string;
  selector?: string;
  mode?: AgentKeyboardWebActionMode;
  pressEnter?: boolean;
  waitAfter?: number;
}

@RegisterAgentAction('keyboard_web')
export class AgentKeyboardWebAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Perform comprehensive keyboard actions on web pages. PRESS_KEY presses a single key, TYPE_TEXT types at current focus, TYPE_IN_ELEMENT types into specific element using CSS selector. Supports different typing modes (replace, append, clear) and optional Enter key press. Use for all keyboard interactions including key presses, text input, and form filling.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        const schema = z.object({
          type: z.nativeEnum(AgentKeyboardWebActionType),
          key: z
            .string()
            .optional()
            .describe(
              'Key name for PRESS_KEY (e.g., "Enter", "ArrowLeft", "Escape", "Tab")'
            ),
          text: z
            .string()
            .optional()
            .describe('Text to type for TYPE_TEXT and TYPE_IN_ELEMENT actions'),
          selector: z
            .string()
            .optional()
            .describe(
              'CSS selector for TYPE_IN_ELEMENT (e.g., "#search-input", "input[name=email]")'
            ),
          mode: z
            .nativeEnum(AgentKeyboardWebActionMode)
            .optional()
            .default(AgentKeyboardWebActionMode.REPLACE)
            .describe(
              'Typing mode for TYPE_IN_ELEMENT: REPLACE (default), APPEND, or CLEAR'
            ),
          pressEnter: z
            .boolean()
            .optional()
            .default(false)
            .describe('Whether to press Enter after typing (default: false)'),
          waitAfter: z
            .number()
            .optional()
            .default(300)
            .describe(
              'Time in milliseconds to wait after action (default: 300ms)'
            ),
        });

        return schema.refine(
          (data) => {
            if (data.type === AgentKeyboardWebActionType.PRESS_KEY) {
              return data.key !== undefined;
            }
            if (data.type === AgentKeyboardWebActionType.TYPE_TEXT) {
              return data.text !== undefined;
            }
            if (data.type === AgentKeyboardWebActionType.TYPE_IN_ELEMENT) {
              return data.text !== undefined && data.selector !== undefined;
            }
            return true;
          },
          {
            message:
              'PRESS_KEY requires key, TYPE_TEXT requires text, TYPE_IN_ELEMENT requires text and selector',
          }
        );
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentKeyboardWebActionParameters;
    if (ENV.DEBUG) {
      const detail =
        action.type === AgentKeyboardWebActionType.PRESS_KEY
          ? `key "${action.key}"`
          : action.type === AgentKeyboardWebActionType.TYPE_IN_ELEMENT
            ? `text "${action.text}" in ${action.selector}`
            : `text "${action.text}"`;
      console.log(
        `Agent ${this.agent.name} performs keyboard action: ${action.type} - ${detail}`
      );
    }

    let actionStr = `keyboard_web --type ${action.type}`;

    if (action.key) {
      actionStr += ` --key "${action.key}"`;
    }

    if (action.text) {
      actionStr += ` --text "${action.text}"`;
    }

    if (action.selector) {
      actionStr += ` --selector "${action.selector}"`;
    }

    if (action.mode && action.mode !== AgentKeyboardWebActionMode.REPLACE) {
      actionStr += ` --mode ${action.mode}`;
    }

    if (action.pressEnter) {
      actionStr += ` --press-enter true`;
    }

    if (action.waitAfter && action.waitAfter !== 300) {
      actionStr += ` --wait-after ${action.waitAfter}`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionStr,
    });
  }
}
