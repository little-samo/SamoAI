import { LocationId } from '../locations/location.js';
import { EntityId } from '../entities/entity.js';

export interface Message {
  locationId: LocationId;

  senderEntityId?: EntityId;
  receiverEntityId?: EntityId;

  timestamp: Date;
}
