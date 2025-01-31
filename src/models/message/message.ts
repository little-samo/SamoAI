import { EntityId } from '@models/entities/entity';
import { LocationId } from '@models/locations/location';

export interface Message {
  locationId: LocationId;

  senderEntityId?: EntityId;
  receiverEntityId?: EntityId;

  timestamp: Date;
}
