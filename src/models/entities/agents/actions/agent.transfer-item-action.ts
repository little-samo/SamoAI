import { z } from 'zod';
import { ENV, LlmToolCall } from '@little-samo/samo-ai/common';

import { EntityKey, ItemKey } from '../../entity.types';

import { RegisterAgentAction } from './agent.action-decorator';
import { AgentAction } from './agent.action';

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
        return `Transfer an item from your inventory to another agent or user.`;
    }
  }

  public override get parameters(): z.ZodSchema {
    switch (this.version) {
      case 1:
      default:
        return z.object({
          itemKey: z.string().describe(`The key of the item to transfer.`),
          count: z.number().describe(`The number of items to transfer.`),
          targetEntityKey: z
            .string()
            .describe(`The key of the agent or user to transfer the item to.`),
          reason: z.string().describe(`The reason for transferring the item.`),
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
      await this.location.addAgentMessage(this.agent, {
        message: action.reason,
        action: `TRANSFER_ITEM:${item.itemDataId}:${action.count}:"${action.targetEntityKey}"`,
      });
    } else {
      await this.location.addSystemMessage(
        `Agent ${this.agent.name} failed to transfer item ${item.itemData?.name ?? item.itemDataId} to ${action.targetEntityKey} (${action.reason})`
      );
    }
  }
}
