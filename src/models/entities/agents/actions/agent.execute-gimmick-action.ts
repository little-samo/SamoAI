import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityKey, EntityType } from '../../entity.types';
import { type Gimmick } from '../../gimmicks';
import { GimmickParameters } from '../../gimmicks/gimmick.types';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentExecuteGimmickActionParameters {
  gimmickKey: EntityKey;
  parameters: GimmickParameters;
}

@RegisterAgentAction('execute_gimmick')
export class AgentExecuteGimmickAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Execute a gimmick with optional parameters.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          gimmickKey: z.string().describe(`The key of the gimmick to execute.`),
          parameters: z
            .union([
              z.string(),
              z.literal('NEXT_MESSAGE'),
              z.record(z.string(), z.unknown()),
            ])
            .describe(
              `Optional parameters for the gimmick execution. These parameters will be validated against the gimmick's parameter schema.`
            ),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentExecuteGimmickActionParameters;
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} executes gimmick: ${action.gimmickKey} with parameters: ${JSON.stringify(action.parameters)}`
      );
    }

    await this.location.addAgentMessage(this.agent, {
      action: `EXECUTE_GIMICK:${action.gimmickKey}:${JSON.stringify(
        action.parameters
      )}`,
    });

    const gimmick = this.location.entities[action.gimmickKey] as Gimmick;
    if (!gimmick || gimmick.type !== EntityType.Gimmick) {
      throw new Error(`Gimmick ${action.gimmickKey} not found`);
    }

    if (!(await gimmick.occupy(this.agent))) {
      await this.location.addSystemMessage(
        `Gimmick ${action.gimmickKey} is not currently available.`
      );
      return;
    }

    if (!(await gimmick.execute(this.agent, action.parameters))) {
      await this.location.addSystemMessage(
        `Agent ${this.agent.name} failed to execute gimmick ${action.gimmickKey}.`
      );
    }
  }
}
