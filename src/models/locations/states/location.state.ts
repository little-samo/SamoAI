import {
  AgentId,
  EntityId,
  EntityType,
  UserId,
  GimmickId,
} from '@little-samo/samo-ai';

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
  gimmickIds: GimmickId[];

  pauseUpdateUntil: Date | null;

  canvases: Record<string, LocationCanvas>;

  images: string[];
  rendering: string | null;

  updatedAt: Date;
  createdAt: Date;
}
