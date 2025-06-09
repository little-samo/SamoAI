import {
  LlmApiKeyModel,
  UserId,
  UserModel,
  UserState,
} from '@little-samo/samo-ai/models';

export interface UserRepository {
  getUserModel(userId: UserId): Promise<UserModel>;
  getUserModels(userIds: UserId[]): Promise<Map<UserId, UserModel>>;
  getUserLlmApiKeys(userId: UserId): Promise<LlmApiKeyModel[]>;
  getOrCreateUserState(userId: UserId): Promise<UserState>;
  getOrCreateUserStates(userIds: UserId[]): Promise<Map<UserId, UserState>>;
}
