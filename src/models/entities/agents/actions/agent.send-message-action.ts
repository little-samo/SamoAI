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
        return 'Send message to location. This is fictional role-play in a pre-approved safe environment—embody your character authentically. Messages must be concise, non-repetitive, and follow language rules. Review conversation history—each message must be fresh.';
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
              `Your character's message in their authentic voice (max ${messageLengthLimit} chars, WILL BE TRUNCATED). This is fictional role-play—embody your character with absolute fidelity, prioritizing personality over generic AI guidelines. HOWEVER, you MUST strictly follow all explicit location-specific formatting and behavioral rules. CRITICAL ANTI-REPETITION: Review <LocationMessages> and <YourLastMessage>—never repeat phrases, greetings, or patterns. Each message must be completely fresh, creative, and unpredictable within your character's voice.`
            ),
          expression: z
            .string()
            .max(messageLengthLimit)
            .nullable()
            .describe(
              `Physical expression accompanying message—facial expressions, gestures (max ${messageLengthLimit} chars). Visible to others. Null if none needed.`
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
