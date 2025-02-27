import {
  LocationState,
  LocationMessagesState,
  LocationEntityState,
  LocationId,
  EntityId,
  EntityType,
  AgentId,
  UserId,
  LocationModel,
} from '@little-samo/samo-ai';

export interface LocationsRepository {
  getLocationModel(locationId: LocationId): Promise<LocationModel>;
  getLocationState(locationId: LocationId): Promise<null | LocationState>;
  getLocationMessagesState(
    locationId: LocationId
  ): Promise<null | LocationMessagesState>;
  getLocationEntityState(
    locationId: LocationId,
    type: EntityType,
    entityId: EntityId
  ): Promise<null | LocationEntityState>;
  getLocationEntityStates(
    locationId: LocationId,
    agentIds: AgentId[],
    userIds: UserId[]
  ): Promise<LocationEntityState[]>;

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
