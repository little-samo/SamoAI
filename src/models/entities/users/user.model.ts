import { LlmApiKeyModel } from '../../llms';

export enum UserPlatform {
  API = 'API',
}

export interface UserModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  platform: UserPlatform;
  pid: bigint;

  username: string | null;
  nickname: string;
  firstName: string | null;
  lastName: string | null;

  meta: object;

  llmApiKeys: LlmApiKeyModel[];
}
