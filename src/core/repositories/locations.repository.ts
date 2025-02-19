import { LocationState } from '@models/locations/states/location.state';
import { LocationMessagesState } from '@models/locations/states/location.messages-state';
import { LocationModel } from '@prisma/client';
import { EntityType } from '@models/entities/entity.types';
import { LocationEntityState } from '@models/locations/states/location.entity-state';

export interface LocationsRepository {
  getLocationModel(locationId: number): Promise<LocationModel>;
  getLocationState(locationId: number): Promise<null | LocationState>;
  getLocationMessagesState(
    locationId: number
  ): Promise<null | LocationMessagesState>;
  getLocationEntityState(
    locationId: number,
    type: EntityType,
    id: number
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
