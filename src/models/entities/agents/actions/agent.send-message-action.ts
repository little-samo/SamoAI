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
        return 'Sends a standard, direct message to the current location. Messages must be clear, concise, in-character, and adhere to your specified language rules. Avoid repetition by reviewing conversation history. All messages are subject to a strict length limit and will be truncated if they exceed it.';
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
              `The content of your message. CRITICAL: Your message must be very concise and adhere strictly to a ${messageLengthLimit} character limit. Any text over this limit WILL BE TRUNCATED. To avoid this, summarize your points or rephrase to be shorter. If a message cannot be shortened without losing its meaning, you may send multiple smaller messages in sequence. Before writing, review the message history to ensure you are not repeating yourself and that your contribution is new and relevant.`
            ),
          expression: z
            .string()
            .max(messageLengthLimit)
            .nullable()
            .describe(
              `Your character's physical expression (e.g., facial expressions, gestures) that accompanies the message. This is visible to others. Keep it brief and under the ${messageLengthLimit} character limit. Can be null if no specific expression is needed.`
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
    });
  }
}
