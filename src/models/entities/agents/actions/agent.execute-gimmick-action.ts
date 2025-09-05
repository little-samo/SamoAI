import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityKey, EntityType } from '../../entity.types';
import { type Gimmick } from '../../gimmicks';
import { GimmickParameters } from '../../gimmicks/gimmick.types';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentExecuteGimmickActionParameters {
  gimmickKey: EntityKey;
  reason: string;
  parameters: GimmickParameters;
}

@RegisterAgentAction('execute_gimmick')
export class AgentExecuteGimmickAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Executes a Gimmick in your current location. CRITICAL: (1) Only ONE Gimmick execution per response turn - multiple calls in the same response will fail. (2) Gimmicks become OCCUPIED during execution and cannot be used by anyone until completion. (3) Check OCCUPIER fields before attempting - occupied Gimmicks will reject your request. (4) Execution is asynchronous - results appear in your private canvas later, not immediately.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          gimmickKey: z.string().describe(`The key of the gimmick to execute.`),
          reason: z
            .string()
            .describe(
              'A reason for executing the gimmick, which will be visible to other agents.'
            ),
          parameters: z
            .union([z.string(), z.record(z.string(), z.unknown())])
            .describe(
              `Optional parameters for the gimmick execution. These parameters MUST strictly conform to the schema defined by the target gimmick's 'PARAMETERS' field.`
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
      action: `execute_gimmick --gimmick-key ${action.gimmickKey} --reason ${JSON.stringify(action.reason)} --parameters ${JSON.stringify(action.parameters)}`,
    });

    const gimmick = this.location.getEntity(action.gimmickKey) as Gimmick;
    if (!gimmick || gimmick.type !== EntityType.Gimmick) {
      throw new Error(`Gimmick ${action.gimmickKey} not found`);
    }

    if (!(await gimmick.occupy(this.agent, undefined, action.reason))) {
      const occupierKey = `${gimmick.state.occupierType}:${gimmick.state.occupierId}`;
      const occupationReason = gimmick.state.occupationReason
        ? ` for "${gimmick.state.occupationReason}"`
        : '';
      const occupationUntil = gimmick.state.occupationUntil!.toISOString();

      await this.location.addSystemMessage(
        `${action.gimmickKey} is currently occupied by ${occupierKey}${occupationReason} until ${occupationUntil}. ` +
          `This gimmick cannot be used while it is occupied. Please wait until the occupation expires or the current entity completes its task, then try again.`
      );
      return;
    }

    const parameters = action.parameters as GimmickParameters;
    const error = await gimmick.execute(
      this.agent,
      parameters,
      action.reason,
      true
    );
    if (error) {
      await this.location.addSystemMessage(
        `Agent ${this.agent.name} failed to execute ${action.gimmickKey}: ${error}`
      );
      await this.location.emitAsync(
        'gimmickExecutionFailed',
        gimmick,
        this.agent,
        action.parameters,
        error
      );
    }
  }
}
