import {
  EntityId,
  EntityType,
} from '@little-samo/samo-ai/models/entities/entity.types';

import { LocationId } from '../location.type';

export interface LocationMessage {
  entityType: EntityType;
  entityId: EntityId;

  targetEntityType?: EntityType;
  targetEntityId?: EntityId;

  name: string;
  expression?: string;
  message?: string;

  updatedAt: Date;
  createdAt: Date;
}

export interface LocationMessagesState {
  locationId: LocationId;
  messages: LocationMessage[];

  updatedAt: Date;
  createdAt: Date;

  dirty?: boolean;
}
