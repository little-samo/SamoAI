import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityKey, EntityType } from '../../entity.types';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

import type { Agent } from '../agent';

export interface AgentSendAgentMessageActionParameters {
  entityKey: string;
  message: string;
  expression: null | string;
}

@RegisterAgentAction('send_agent_message')
export class AgentSendAgentMessageAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return 'Control another agent to speak/act. Reference their <Character> in <OtherAgents> for voice consistency.';
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
          entityKey: z
            .string()
            .describe(
              `Target agent key (format: "agent:ID") from <OtherAgents>.`
            ),
          message: z
            .string()
            .max(messageLengthLimit)
            .describe(
              `Message in target character's voice (max ${messageLengthLimit} chars). Match their personality from <Character>. Follow location formatting rules.`
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
    const action = call.arguments as AgentSendAgentMessageActionParameters;

    const targetEntity = this.location.getEntity(action.entityKey as EntityKey);

    if (!targetEntity) {
      throw new Error(
        `Entity with key ${action.entityKey} not found in this location`
      );
    }

    if (targetEntity.type !== EntityType.Agent) {
      throw new Error(
        `Entity ${action.entityKey} is not an agent (type: ${targetEntity.type})`
      );
    }

    if (targetEntity.key === this.agent.key) {
      throw new Error(
        `Cannot control yourself (${action.entityKey}). You can only control other agents.`
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
