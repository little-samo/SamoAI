import {
  LlmApiKeyModel,
  UserId,
  UserModel,
  UserState,
  ItemModel,
} from '@little-samo/samo-ai/models';

export interface UsersRepository {
  getUserModel(userId: UserId): Promise<UserModel>;
  getUserModels(userIds: UserId[]): Promise<Record<UserId, UserModel>>;
  getUserLlmApiKeys(userId: UserId): Promise<LlmApiKeyModel[]>;
  getOrCreateUserState(userId: UserId): Promise<UserState>;
  getOrCreateUserStates(userIds: UserId[]): Promise<Record<UserId, UserState>>;
  getUserItemModels(userIds: UserId[]): Promise<Record<UserId, ItemModel[]>>;
}
