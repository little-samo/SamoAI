import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export enum AgentTypeWebActionMode {
    REPLACE = 'REPLACE',
    APPEND = 'APPEND',
    CLEAR = 'CLEAR',
}

export interface AgentTypeWebActionParameters {
    text: string;
    selector?: string;
    mode?: AgentTypeWebActionMode;
    pressEnter?: boolean;
    waitAfter?: number;
}

@RegisterAgentAction('type_web')
export class AgentTypeWebAction extends AgentAction {
    public override get description(): string {
        switch (this.version) {
            case 1:
            default:
                return `Type text into web page input elements. Use selector to target specific input fields or text areas, or leave empty to type into the currently focused element. Supports different typing modes: REPLACE (clear and type), APPEND (add to existing text), or CLEAR (clear only). Optional Enter key press after typing. Use as standalone action when typing might trigger form validation, auto-complete, search suggestions, or when pressing Enter to submit forms. Safe to use in control_web for simple text input without side effects.`;
        }
    }

    public override get parameters(): z.ZodSchema {
        switch (this.version) {
            case 1:
            default:
                return z.object({
                    text: z
                        .string()
                        .describe(
                            'Text to type into the input field'
                        ),
                    selector: z
                        .string()
                        .optional()
                        .describe(
                            'CSS selector to target specific input element (e.g., "#email", "input[name=username]", "textarea"). If not provided, types into currently focused element.'
                        ),
                    mode: z
                        .nativeEnum(AgentTypeWebActionMode)
                        .optional()
                        .default(AgentTypeWebActionMode.REPLACE)
                        .describe(
                            'Typing mode: REPLACE (clear and type new text), APPEND (add to existing text), or CLEAR (clear field only)'
                        ),
                    pressEnter: z
                        .boolean()
                        .optional()
                        .default(false)
                        .describe(
                            'Whether to press Enter key after typing (useful for submitting forms or search)'
                        ),
                    waitAfter: z
                        .number()
                        .optional()
                        .default(500)
                        .describe(
                            'Time in milliseconds to wait after typing (default: 500ms)'
                        ),
                });
        }
    }

    public override async execute(call: LlmToolCall): Promise<void> {
        const action = call.arguments as AgentTypeWebActionParameters;
        if (ENV.DEBUG) {
            console.log(
                `Agent ${this.agent.name} types text into web element: "${action.text}" (${action.selector || 'focused element'})`
            );
        }

        // Build action string with parameters
        let actionStr = `type_web --text "${action.text}"`;

        if (action.selector) {
            actionStr += ` --selector "${action.selector}"`;
        }

        if (action.mode && action.mode !== AgentTypeWebActionMode.REPLACE) {
            actionStr += ` --mode ${action.mode}`;
        }

        if (action.pressEnter) {
            actionStr += ` --press-enter`;
        }

        if (action.waitAfter && action.waitAfter !== 500) {
            actionStr += ` --wait-after ${action.waitAfter}`;
        }

        await this.location.addAgentMessage(this.agent, {
            action: actionStr,
        });
    }
} 