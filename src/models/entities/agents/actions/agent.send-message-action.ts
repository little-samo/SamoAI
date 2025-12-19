import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentSendMessageActionParameters {
  message: string;
  expression: null | string;
}

@RegisterAgentAction('send_message')
export class AgentSendMessageAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Send message to location as your character. Follow location-specific formatting rules.';
    }
  }

  public override get parameters(): z.ZodSchema {
    const messageLengthLimit =
      this.location.meta.agentMessageLengthLimit ??
      this.location.meta.messageLengthLimit;
    switch (this.version) {
      case 1:
      default:
        return z.object({
          message: z
            .string()
            .max(messageLengthLimit)
            .describe(
              `Your message in character voice (max ${messageLengthLimit} chars). Follow location formatting rules. Never repeat previous messages.`
            ),
          expression: z
            .string()
            .max(messageLengthLimit)
            .nullable()
            .describe(
              `Physical expression—gestures, facial expressions. Null if none.`
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
      await this.agent.setExpression(action.expression);
      if (ENV.DEBUG) {
        console.log(
          `Agent ${this.agent.name} expression: ${action.expression}`
        );
      }
    }

    await this.location.addAgentMessage(this.agent, {
      message: action.message,
      expression: action.expression ?? undefined,
      createdAt: this.location.useAgentStartTimeForMessages
        ? this.agent.updateStartedAt
        : undefined,
    });
  }
}
