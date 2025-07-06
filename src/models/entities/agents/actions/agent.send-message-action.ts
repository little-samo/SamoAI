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
        return 'Sends a message to the location. Focus on clear communication. **Ensure the response is concise and strictly adheres to length limits.** If a message is too long to be summarized effectively, you MAY send multiple messages in sequence using this tool multiple times within a single turn.';
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
              `The message to send. **Strictly adhere to the ${messageLengthLimit} character limit, but consider leaving some buffer space as character count estimation can be inaccurate.** Text exceeding this limit **WILL BE TRUNCATED** upon execution. **Summarize or rephrase if your natural response is too long.** If summarization significantly harms the message clarity, you MAY break the response into multiple shorter messages by calling this tool multiple times in sequence within the same turn.`
            ),
          expression: z
            .string()
            .max(messageLengthLimit)
            .nullable()
            .describe(
              `Your outward expressions, such as facial expressions and gestures. Visible to others. Can be null to indicate no expression. Max length: ${messageLengthLimit} characters include whitespace, but consider leaving some buffer space as character count estimation can be inaccurate. Text exceeding this limit **WILL BE TRUNCATED** upon execution.`
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
