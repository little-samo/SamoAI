import { LocationId } from '../location.types';

import type { EntityId, EntityType } from '../../entities';

export interface LocationMessage {
  locationId: LocationId;

  entityType: EntityType;
  entityId: EntityId;

  targetEntityType?: EntityType;
  targetEntityId?: EntityId;

  name: string;
  expression?: string;
  message?: string;
  action?: string;
  emotion?: string;

  image?: string;
  imageKey?: string;

  // Flag to indicate if this message has been processed in location update
  processed?: boolean;

  updatedAt: Date;
  createdAt: Date;
}
