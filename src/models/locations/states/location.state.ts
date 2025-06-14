import { AgentId, EntityId, EntityType, UserId } from '@little-samo/samo-ai';

import { LocationId } from '../location.types';

export interface LocationCanvas {
  lastModifierEntityType: EntityType;
  lastModifierEntityId: EntityId;

  text: string;

  updatedAt: Date;
  createdAt: Date;
}

export interface LocationState {
  locationId: LocationId;

  agentIds: AgentId[];
  userIds: UserId[];

  pauseUpdateUntil: Date | null;
  pauseUpdateReason: string | null;

  canvases: Record<string, LocationCanvas>;

  images: string[];
  rendering: string | null;

  updatedAt: Date;
  createdAt: Date;
}
