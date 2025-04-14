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
        return `Executes a specified Gimmick entity within the current location. Checks Gimmick availability and occupies it upon successful execution initiation. See 'parameters' for details on input requirements.`;
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
              `Optional parameters for the gimmick execution. These parameters MUST strictly conform to the schema defined by the target gimmick's 'PARAMETERS' field. If 'NEXT_MESSAGE' is used, it is only valid if the gimmick explicitly supports it; in this case, the text content of your *next* message in this turn will be passed as the argument, and you MUST call this 'execute_gimmick' tool *before* the messaging tool in the same turn.`
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
