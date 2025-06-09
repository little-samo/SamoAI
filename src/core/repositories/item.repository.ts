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
  createItemModel(
    ownerEntityKey: EntityKey,
    dataId: ItemDataId,
    count: number
  ): Promise<ItemModel>;
  addOrCreateItemModel(
    ownerEntityKey: EntityKey,
    dataId: ItemDataId,
    count: number
  ): Promise<ItemModel>;
  removeItemModel(
    ownerEntityKey: EntityKey,
    item: ItemModel,
    count: number
  ): Promise<void>;
  transferItemModel(
    ownerEntityKey: EntityKey,
    item: ItemModel,
    targetEntityKey: EntityKey,
    count: number
  ): Promise<void>;
}
