import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { EntityKey, ItemKey } from '../../entity.types';

import { AgentAction } from './agent.action';
import { RegisterAgentAction } from './agent.action-decorator';

export interface AgentTransferItemActionParameters {
  itemKey: ItemKey;
  count: number;
  targetEntityKey: EntityKey;
  reason: string;
}

@RegisterAgentAction('transfer_item')
export class AgentTransferItemAction extends AgentAction {
  public override get description(): string {
    switch (this.version) {
      case 1:
      default:
        return `Transfer item to agent/user.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          itemKey: z.string().describe(`Item key.`),
          count: z.number().describe(`Quantity.`),
          targetEntityKey: z.string().describe(`Target entity key.`),
          reason: z.string().describe(`Reason for transfer.`),
        });
    }
  }

  public override async execute(call: LlmToolCall): Promise<void> {
    const action = call.arguments as AgentTransferItemActionParameters;
    const item = this.agent.getItemByItemKey(action.itemKey);
    if (!item) {
      throw new Error(
        `Agent ${this.agent.name} does not have item ${action.itemKey}`
      );
    }
    if (ENV.DEBUG) {
      console.log(
        `Agent ${this.agent.name} transfers item ${item.itemData?.name ?? action.itemKey} to ${action.targetEntityKey} (${action.reason})`
      );
    }

    if (
      await this.agent.transferItem(item, action.count, action.targetEntityKey)
    ) {
      const targetEntity = this.location.getEntity(action.targetEntityKey);
      await this.location.addAgentMessage(this.agent, {
        message: action.reason,
        action: `transfer_item --item-key ${action.itemKey} --item-name ${JSON.stringify(item.itemData?.name ?? item.itemDataId)} --count ${action.count} --target-key ${action.targetEntityKey} --target-name ${JSON.stringify(targetEntity?.name ?? action.targetEntityKey)}`,
      });
    } else {
      await this.location.addSystemMessage(
        `Agent ${this.agent.name} failed to transfer item ${item.itemData?.name ?? item.itemDataId} to ${action.targetEntityKey} (${action.reason})`
      );
    }
  }
}
