import { UserState } from '@models/entities/users/states/user.state';
import { UserApiKeyModel, UserModel } from '@prisma/client';

export interface UsersRepository {
  getUserLlmApiKeys(userId: number): Promise<UserApiKeyModel[]>;
  getUserModel(userId: number): Promise<UserModel>;
  getUserModelByApiKey(apiKey: string): Promise<UserModel>;
  getUserState(userId: number): Promise<null | UserState>;

  saveUserModel(model: UserModel): Promise<void>;
  saveUserState(state: UserState): Promise<void>;
}
