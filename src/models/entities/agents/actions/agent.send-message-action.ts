import { ENV } from '@common/config';
import { z } from 'zod';
import { LlmToolCall } from '@common/llms/llm.tool';

import { AgentAction } from './agent.action';

export interface AgentSendMessageActionParameters {
  message: string;
  expression: null | string;
}

export class AgentSendMessageAction extends AgentAction {
  public static readonly ACTION_TYPE = 'send_message';

  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Send a message.';
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          message: z
            .string()
            .max(this.location.meta.messageLengthLimit)
            .describe('The message you want to send. Visible to others.'),
          expression: z
            .string()
            .max(this.location.meta.messageLengthLimit)
            .optional()
            .describe(
              'Your outward expressions, such as facial expressions and gestures. Visible to others. Can be null to indicate no expression.'
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentSendMessageActionParameters;
    if (ENV.DEBUG) {
      console.log(`Agent ${this.agent.name} says: ${action.message}`);
    }

    if (action.expression) {
      this.agent.state.expression = action.expression;
      if (ENV.DEBUG) {
        console.log(
          `Agent ${this.agent.name} expression: ${action.expression}`
        );
      }
    }

    this.location.addAgentMessage(
      this.agent,
      action.message,
      action.expression ?? undefined
    );
  }
}
