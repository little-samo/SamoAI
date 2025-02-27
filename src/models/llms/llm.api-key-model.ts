import { LlmPlatform } from '@little-samo/samo-ai/common';

import { UserModel } from '../entities';

export interface LlmApiKeyModel {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  userModel: UserModel | null;
  userModelId: number | null;

  platform: LlmPlatform;
  key: string;
}
