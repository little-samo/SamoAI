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
              z.literal('PREV_MESSAGE'),
              z.record(z.string(), z.unknown()),
            ])
            .describe(
              `Optional parameters for the gimmick execution. These parameters MUST strictly conform to the schema defined by the target gimmick's 'PARAMETERS' field. If 'PREV_MESSAGE' is used, it is only valid if the gimmick explicitly supports it; in this case, the text content of your *previous* message in this turn will be passed as the argument. You MUST call the messaging tool *before* this 'execute_gimmick' tool in the same turn. If there was no previous message in the turn, the tool call may be invalid.`
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
      action: `EXECUTE_GIMMICK:${action.gimmickKey}:${JSON.stringify(
        action.parameters
      )}`,
    });

    const gimmick = this.location.entities[action.gimmickKey] as Gimmick;
    if (!gimmick || gimmick.type !== EntityType.Gimmick) {
      throw new Error(`Gimmick ${action.gimmickKey} not found`);
    }

    if (!(await gimmick.occupy(this.agent))) {
      await this.location.addSystemMessage(
        `${action.gimmickKey} is not currently available.`
      );
      return;
    }

    let parameters = action.parameters as GimmickParameters;
    const messages = [...this.location.messagesState.messages].reverse();
    const lastMessage = messages.find(
      (message) =>
        message.entityType === EntityType.Agent &&
        message.entityId === this.agent.id &&
        message.message
    );
    const messageText = lastMessage?.message as string;
    if (typeof parameters === 'string') {
      if (parameters === 'PREV_MESSAGE') {
        if (!messageText) {
          await this.location.addSystemMessage(
            `Agent ${this.agent.name} has no previous message in the current turn to execute ${action.gimmickKey}.`
          );
          return;
        }
        parameters = messageText;
      }
    } else {
      const replaceWithPrevMessage = (
        obj: Record<string, unknown>
      ): Record<string, unknown> => {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
          if (value === 'PREV_MESSAGE') {
            if (!messageText) {
              throw new Error(
                `Agent ${this.agent.name} has no previous message in the current turn to execute ${action.gimmickKey}.`
              );
            }

            result[key] = messageText;
          } else if (typeof value === 'object' && value) {
            result[key] = replaceWithPrevMessage(
              value as Record<string, unknown>
            );
          } else {
            result[key] = value;
          }
        }

        return result;
      };

      try {
        parameters = replaceWithPrevMessage(
          parameters as Record<string, unknown>
        );
      } catch {
        await this.location.addSystemMessage(
          `Agent ${this.agent.name} has no previous message in the current turn to execute ${action.gimmickKey}.`
        );
        return;
      }
    }

    const error = await gimmick.execute(this.agent, parameters, true);
    if (error) {
      await this.location.emitAsync(
        'gimmickExecutionFailed',
        gimmick,
        this.agent,
        action.parameters,
        error
      );
      await this.location.addSystemMessage(
        `Agent ${this.agent.name} failed to execute ${action.gimmickKey}: ${error}`
      );
    }
  }
}
