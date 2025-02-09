import { LocationState } from '@models/locations/states/location.state';
import { LocationMessagesState } from '@models/locations/states/location.messages-state';
import { LocationModel } from '@prisma/client';

export interface LocationsRepository {
  getLocationModel(locationId: number): Promise<LocationModel>;
  getLocationState(locationId: number): Promise<null | LocationState>;
  getLocationMessagesState(
    locationId: number
  ): Promise<null | LocationMessagesState>;

  saveLocationModel(model: LocationModel): Promise<void>;
  saveLocationState(state: LocationState): Promise<void>;
  saveLocationMessagesState(state: LocationMessagesState): Promise<void>;
}
