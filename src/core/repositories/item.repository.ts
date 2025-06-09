import {
  AgentId,
  EntityKey,
  ItemDataId,
  ItemModel,
  UserId,
} from '@little-samo/samo-ai/models';

export interface ItemOwner {
  ownerAgentId: AgentId | null;
  ownerUserId: UserId | null;
}

export interface ItemRepository {
  getEntityItemModels(
    agentIds: AgentId[],
    userIds: UserId[]
  ): Promise<Record<EntityKey, ItemModel[]>>;
  createItemModel(
    owner: ItemOwner,
    dataId: ItemDataId,
    count: number
  ): Promise<ItemModel>;
  addOrCreateItemModel(
    owner: ItemOwner,
    dataId: ItemDataId,
    count: number
  ): Promise<ItemModel>;
  removeItemModel(
    owner: ItemOwner,
    item: ItemModel,
    count: number
  ): Promise<void>;
  transferItemModel(
    owner: ItemOwner,
    item: ItemModel,
    targetOwner: ItemOwner,
    count: number
  ): Promise<void>;
}
