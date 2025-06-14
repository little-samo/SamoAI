import type { EntityId, EntityType } from '../../entities';

export interface LocationMessage {
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

  updatedAt: Date;
  createdAt: Date;
}
