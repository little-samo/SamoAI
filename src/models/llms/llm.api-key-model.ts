import { LlmApiKeyOptions, LlmPlatform } from '@little-samo/samo-ai/common';

export interface LlmApiKeyModel extends LlmApiKeyOptions {
  id: number;
  createdAt: Date;
  updatedAt: Date;

  platform: LlmPlatform;
  key: string; // Override to make it required
}
