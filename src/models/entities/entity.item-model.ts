export interface ItemModel {
  id: string | number | bigint;
  createdAt: Date;
  updatedAt: Date;

  ownerAgentId: string | number | bigint | null;
  ownerUserId: string | number | bigint | null;

  itemDataId: number;
  itemData?: ItemDataModel;
  count: number;
}

export interface ItemDataModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  name: string;
  description: string | null;
  memo: string | null;

  stackable: boolean;

  isAgentHidden?: boolean;
}
