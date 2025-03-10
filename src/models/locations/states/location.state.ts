import { AgentId, UserId } from '@little-samo/samo-ai';

import { LocationId } from '../location.type';

export interface LocationState {
  locationId: LocationId;

  agentIds: AgentId[];
  userIds: UserId[];

  pauseUpdateUntil: Date | null;

  images: string[];
  rendering: string | null;

  updatedAt: Date;
  createdAt: Date;
}
