export interface ItemModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  ownerAgentId?: number;
  ownerUserId?: number;

  itemDataId: number;
  itemData?: ItemDataModel;
}

export interface ItemDataModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  name: string;
  description?: string;
  memo?: string;
}
