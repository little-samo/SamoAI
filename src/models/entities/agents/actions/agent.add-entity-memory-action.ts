import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityKey } from '../../entity.types';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentAddEntityMemoryActionParameters {
  key: EntityKey;
  memory: string;
}

@RegisterAgentAction('add_entity_memory')
export class AgentAddEntityMemoryAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Propose a memory about a specific entity. Use entity's KEY field (format: "type:numericId").`;
    }
  }

  public override get parameters(): z.ZodSchema {
    const maxLength = this.agent.meta.entityMemoryLengthLimit;
    switch (this.version) {
      case 1:
      default:
        return z.object({
          key: z
            .string()
            .describe(
              `Entity key (e.g., "user:123", "agent:456"). Use KEY field from context.`
            ),
          memory: z
            .string()
            .max(maxLength)
            .describe(
              `Concise fact about this entity in English (max ${maxLength} chars).`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentAddEntityMemoryActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} added memory for entity ${action.key} with value ${action.memory}`
      );
    }
  }
}
