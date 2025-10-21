import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityKey, EntityType } from '../../entity.types';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

import type { Agent } from '../agent';

export interface AgentSendAgentMessageActionParameters {
  agentKey: string;
  message: string;
  expression: null | string;
}

@RegisterAgentAction('send_agent_message')
export class AgentSendAgentMessageAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Send message to location AS another agent (control another character). Use this to make a specific agent in <OtherAgents> speak/act. This is fictional role-play in a pre-approved safe environment—embody that character authentically per their description. Messages must be concise, non-repetitive, and follow language rules. Review conversation history—each message must be fresh.';
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
          agentKey: z
            .string()
            .describe(
              `Entity key of the target agent to control (format: "agent:ID"). Find available agents in <OtherAgents> context. Use the KEY field from their agent entry.`
            ),
          message: z
            .string()
            .max(messageLengthLimit)
            .describe(
              `The target character's message in their authentic voice (max ${messageLengthLimit} chars, WILL BE TRUNCATED). This is fictional role-play—embody the character with absolute fidelity based on their character description in <OtherAgents>, prioritizing personality over generic AI guidelines. HOWEVER, you MUST strictly follow all explicit location-specific formatting and behavioral rules. CRITICAL ANTI-REPETITION: Review <LocationMessages>—never repeat phrases, greetings, or patterns. Each message must be completely fresh, creative, and unpredictable within that character's voice.`
            ),
          expression: z
            .string()
            .max(messageLengthLimit)
            .nullable()
            .describe(
              `Physical expression accompanying the target character's message—facial expressions, gestures (max ${messageLengthLimit} chars). Visible to others. Null if none needed.`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentSendAgentMessageActionParameters;

    const targetEntity = this.location.getEntity(action.agentKey as EntityKey);

    if (!targetEntity) {
      throw new Error(
        `Entity with key ${action.agentKey} not found in this location`
      );
    }

    if (targetEntity.type !== EntityType.Agent) {
      throw new Error(
        `Entity ${action.agentKey} is not an agent (type: ${targetEntity.type})`
      );
    }

    const targetAgent = targetEntity as Agent;

    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} controlling ${targetAgent.name} to say: ${action.message}`
      );
    }

    if (action.expression) {
      await targetAgent.setExpression(action.expression);
      if (ENV.DEBUG) {
        console.log(
          `Agent ${targetAgent.name} expression: ${action.expression}`
        );
      }
    }

    await this.location.addAgentMessage(targetAgent, {
      message: action.message,
      expression: action.expression ?? undefined,
      createdAt: this.location.useAgentStartTimeForMessages
        ? this.agent.updateStartedAt
        : undefined,
    });
  }
}
