import {
  EntityId,
  EntityType,
} from '@little-samo/samo-ai/models/entities/entity.types';

import { LocationId } from '../location.type';

export interface LocationEntityCanvas {
  text: string;

  updatedAt: Date;
  createdAt: Date;
}

export interface LocationEntityState {
  locationId: LocationId;
  targetType: EntityType;
  targetId: EntityId;

  isActive: boolean | null;
  expression: string | null;

  canvases: Record<string, LocationEntityCanvas>;

  updatedAt: Date;
  createdAt: Date;
}
