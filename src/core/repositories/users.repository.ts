import { UserState } from '@models/entities/users/states/user.state';
import { LlmApiKeyModel, UserModel } from '@prisma/client';

export interface UsersRepository {
  getUserLlmApiKeys(userId: number): Promise<LlmApiKeyModel[]>;
  getUserModel(userId: number): Promise<UserModel>;
  getUserModelByApiKey(apiKey: string): Promise<UserModel>;
  getUserModels(userIds: number[]): Promise<Record<number, UserModel>>;
  getUserState(userId: number): Promise<null | UserState>;
  getUserStates(userIds: number[]): Promise<Record<number, UserState>>;

  saveUserModel(model: UserModel): Promise<UserModel>;
  saveUserState(state: UserState): Promise<void>;
}
