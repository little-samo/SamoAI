import {
  EntityId,
  EntityType,
} from '@little-samo/samo-ai/models/entities/entity.types';

import { LocationId } from '../location.type';

export interface LocationEntityState {
  locationId: LocationId;
  targetType: EntityType;
  targetId: EntityId;

  isActive: boolean | null;
  expression: string | null;

  updatedAt: Date;
  createdAt: Date;
}
