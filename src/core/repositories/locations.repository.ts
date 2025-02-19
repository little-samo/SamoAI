import { LocationState } from '@models/locations/states/location.state';
import { LocationMessagesState } from '@models/locations/states/location.messages-state';
import { LocationModel } from '@prisma/client';
import { EntityId, EntityType } from '@models/entities/entity.types';
import { LocationEntityState } from '@models/locations/states/location.entity-state';
import { LocationId } from '@models/locations/location';

export interface LocationsRepository {
  getLocationModel(locationId: LocationId): Promise<LocationModel>;
  getLocationState(locationId: LocationId): Promise<null | LocationState>;
  getLocationMessagesState(
    locationId: LocationId
  ): Promise<null | LocationMessagesState>;
  getLocationEntityState(
    locationId: LocationId,
    type: EntityType,
    id: EntityId
  ): Promise<null | LocationEntityState>;

  saveLocationModel(model: LocationModel): Promise<LocationModel>;
  saveLocationState(state: LocationState): Promise<void>;
  saveLocationMessagesState(state: LocationMessagesState): Promise<void>;
  saveLocationEntityState(state: LocationEntityState): Promise<void>;
  saveLocationEntityStateIsActive(
    state: LocationEntityState,
    isActive: boolean
  ): Promise<void>;
  saveLocationEntityStateExpression(
    state: LocationEntityState,
    expression: string
  ): Promise<void>;
}
