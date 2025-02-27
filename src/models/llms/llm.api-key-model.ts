import { LlmPlatform } from '@little-samo/samo-ai/common';

export interface LlmApiKeyModel {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  platform: LlmPlatform;
  key: string;
}
