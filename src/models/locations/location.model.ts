import { UserPlatform } from '../entities';

export enum LocationType {
  PRIVATE = 'PRIVATE',
  GROUP = 'GROUP',
}

export interface LocationModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  platform: UserPlatform;
  type: LocationType;

  name: string;
  key: string;
  meta: object;
}
