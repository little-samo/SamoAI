import { AgentId, EntityId, EntityType, UserId } from '@little-samo/samo-ai';

import { LocationId } from '../location.type';

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

  canvases: Map<string, LocationCanvas>;

  images: string[];
  rendering: string | null;

  updatedAt: Date;
  createdAt: Date;
}
