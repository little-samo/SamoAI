import {
  AgentId,
  EntityKey,
  ItemDataId,
  ItemModel,
  UserId,
} from '@little-samo/samo-ai/models';

export interface ItemOwner {
  ownerAgentId: number | null;
  ownerUserId: number | null;
}

export interface ItemsRepository {
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
