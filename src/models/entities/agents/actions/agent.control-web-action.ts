import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentControlWebActionInput {
  CLICK = 'CLICK',
  TYPE = 'TYPE',
  SCROLL_UP = 'SCROLL_UP',
  SCROLL_DOWN = 'SCROLL_DOWN',
  NAVIGATE_BACK = 'NAVIGATE_BACK',
  NAVIGATE_FORWARD = 'NAVIGATE_FORWARD',
  REFRESH = 'REFRESH',
  FOCUS = 'FOCUS',
  SUBMIT = 'SUBMIT',
  CLEAR = 'CLEAR',
}

export interface AgentControlWebActionParameters {
  inputs: AgentControlWebActionInput[];
  selector?: string;
  text?: string;
  coordinates?: string;
}

@RegisterAgentAction('control_web')
export class AgentControlWebAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Execute multiple web page actions sequentially in a single command. This is a compound action for performing workflows like "click button then type text". Available inputs: CLICK, TYPE, SCROLL_UP, SCROLL_DOWN, NAVIGATE_BACK, NAVIGATE_FORWARD, REFRESH, FOCUS, SUBMIT, CLEAR. Use this when you need to perform 2-4 related actions in sequence that do NOT require waiting for page loads, network requests, or DOM changes between actions. IMPORTANT: If any action might trigger page navigation, form submission, AJAX requests, or significant DOM changes that require loading time, split the actions and use individual tools (click_web, type_web, etc.) instead. Wait for the previous action result before proceeding with the next action. Examples of when to split: clicking submit buttons, navigation links, or any action that changes page state. Use compound actions only for immediate, synchronous interactions like "focus input field then type text" or "scroll then click visible element". Note that this tool can only be used once per response.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        const maxInputs = 4;
        return z.object({
          inputs: z
            .array(z.nativeEnum(AgentControlWebActionInput))
            .min(1)
            .max(maxInputs)
            .describe(
              `The inputs to control the web page. Each input represents a single action and they will be executed sequentially in the order provided. Max length: ${maxInputs} inputs.`
            ),
          selector: z
            .string()
            .optional()
            .describe(
              'CSS selector for targeting specific elements (e.g., "#button-id", ".class-name", "input[type=text]")'
            ),
          text: z
            .string()
            .optional()
            .describe('Text to type when using TYPE action'),
          coordinates: z
            .string()
            .optional()
            .describe(
              'Coordinates in "x,y" format for position-based actions like CLICK'
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentControlWebActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} controls web page with: ${action.inputs.join(', ')}`
      );
    }

    // Build action string with parameters
    let actionStr = `control_web --inputs ${action.inputs.slice(0, 4).join(',')}`;

    if (action.selector) {
      actionStr += ` --selector "${action.selector}"`;
    }

    if (action.text) {
      actionStr += ` --text "${action.text}"`;
    }

    if (action.coordinates) {
      actionStr += ` --coordinates "${action.coordinates}"`;
    }

    await this.location.addAgentMessage(this.agent, {
      action: actionStr,
    });
  }
}
