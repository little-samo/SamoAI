export interface ItemModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  ownerAgentId: number | null;
  ownerUserId: number | null;

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
