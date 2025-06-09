import { type AgentId } from './agents';
import { type UserId } from './users';

export interface ItemModel {
  id: string | number | bigint;
  createdAt: Date;
  updatedAt: Date;

  ownerAgentId: AgentId | null;
  ownerUserId: UserId | null;

  itemDataId: number;
  itemData?: ItemDataModel;
  count: number;
}

export interface ItemDataModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  name: string;
  description?: string;
  memo?: string;

  stackable: boolean;
}
