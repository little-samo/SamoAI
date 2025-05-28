import { LocationId } from '../location.type';

import type { EntityId, EntityType } from '../../entities';

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
