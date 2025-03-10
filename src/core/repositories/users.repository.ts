import { LlmApiKeyModel, UserId, UserModel } from '@little-samo/samo-ai/models';
import { UserState } from '@little-samo/samo-ai/models/entities/users/states/user.state';

export interface UsersRepository {
  getUserModel(userId: UserId): Promise<UserModel>;
  getUserModels(userIds: UserId[]): Promise<Record<UserId, UserModel>>;
  getUserLlmApiKeys(userId: UserId): Promise<LlmApiKeyModel[]>;
  getOrCreateUserState(userId: UserId): Promise<UserState>;
  getOrCreateUserStates(userIds: UserId[]): Promise<Record<UserId, UserState>>;
}
