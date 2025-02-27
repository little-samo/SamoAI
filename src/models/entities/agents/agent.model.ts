import { UserModel } from '../users';

export interface AgentModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  name: string;
  username: string | null;

  meta: object;

  ownerUserModel: UserModel | null;
  ownerUserId: number | null;

  isActive: boolean;
  isDeleted: boolean;
}
