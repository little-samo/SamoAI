import {
  ENV,
  formatDateWithValidatedTimezone,
  LlmToolCall,
} from '@little-samo/samo-ai/common';
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
        return `Execute a Gimmick. One per turn. Check OCCUPIER_* fields first—occupied gimmicks reject requests. Results appear in canvas asynchronously.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          gimmickKey: z.string().describe(`Gimmick key from <Gimmicks>.`),
          reason: z
            .string()
            .describe('Reason for execution (visible to others).'),
          parameters: z
            .union([z.string(), z.record(z.string(), z.unknown())])
            .describe(`Parameters matching gimmick's PARAMETERS schema.`),
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
      const formattedOccupationUntil = formatDateWithValidatedTimezone(
        gimmick.state.occupationUntil!,
        this.agent.timezone
      );
      await this.location.addSystemMessage(
        `${action.gimmickKey} is currently occupied by ${occupierKey}${occupationReason} until ${formattedOccupationUntil}. ` +
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
