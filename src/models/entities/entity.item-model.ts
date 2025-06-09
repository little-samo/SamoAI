import { type AgentId } from './agents';
import { type ItemDataId, type ItemId } from './entity.types';
import { type UserId } from './users';

export interface ItemModel {
  id: ItemId;
  createdAt: Date;
  updatedAt: Date;

  ownerAgentId: AgentId | null;
  ownerUserId: UserId | null;

  itemDataId: ItemDataId;
  itemData?: ItemDataModel;
  count: number;
}

export interface ItemDataModel {
  id: ItemDataId;
  createdAt: Date;
  updatedAt: Date;

  name: string;
  description?: string;
  memo?: string;

  stackable: boolean;
}
