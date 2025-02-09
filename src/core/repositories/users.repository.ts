import { UserState } from '@models/entities/users/states/user.state';
import { UserApiKeyModel, UserModel } from '@prisma/client';

export interface UsersRepository {
  getUserLlmApiKeys(userId: number): Promise<UserApiKeyModel[]>;
  getUserModel(userId: number): Promise<UserModel>;
  getUserModelByApiKey(apiKey: string): Promise<UserModel>;
  getUserModels(userIds: number[]): Promise<Record<number, UserModel>>;
  getUserState(userId: number): Promise<null | UserState>;
  getUserStates(userIds: number[]): Promise<Record<number, UserState>>;

  saveUserModel(model: UserModel): Promise<void>;
  saveUserState(state: UserState): Promise<void>;
  saveUserStates(states: UserState[]): Promise<void>;
}
