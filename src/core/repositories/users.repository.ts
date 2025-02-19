import { UserId } from '@models/entities/entity.types';
import { UserState } from '@models/entities/users/states/user.state';
import { LlmApiKeyModel, UserModel } from '@prisma/client';

export interface UsersRepository {
  getUserLlmApiKeys(userId: UserId): Promise<LlmApiKeyModel[]>;
  getUserModel(userId: UserId): Promise<UserModel>;
  getUserModelByApiKey(apiKey: string): Promise<UserModel>;
  getUserModels(userIds: UserId[]): Promise<Record<UserId, UserModel>>;
  getUserState(userId: UserId): Promise<null | UserState>;
  getUserStates(userIds: UserId[]): Promise<Record<UserId, UserState>>;

  saveUserModel(model: UserModel): Promise<UserModel>;
  saveUserState(state: UserState): Promise<void>;
}
