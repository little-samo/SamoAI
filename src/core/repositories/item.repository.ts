import {
  AgentId,
  EntityKey,
  ItemDataId,
  ItemModel,
  UserId,
} from '@little-samo/samo-ai/models';

export interface ItemRepository {
  getEntityItemModels(
    agentIds: AgentId[],
    userIds: UserId[]
  ): Promise<Record<EntityKey, ItemModel[]>>;
  addOrCreateItemModel(
    ownerEntityKey: EntityKey,
    dataId: ItemDataId,
    count: number,
    reason?: string
  ): Promise<ItemModel>;
  removeItemModel(
    ownerEntityKey: EntityKey,
    item: ItemModel,
    count: number,
    options?: {
      reason?: string;
      force?: boolean;
    }
  ): Promise<void>;
  transferItemModel(
    ownerEntityKey: EntityKey,
    item: ItemModel,
    targetEntityKey: EntityKey,
    count: number,
    options?: {
      reason?: string;
      force?: boolean;
    }
  ): Promise<void>;
}
