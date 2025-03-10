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
  LocationMessage,
} from '@little-samo/samo-ai';

export interface LocationsRepository {
  getLocationModel(locationId: LocationId): Promise<LocationModel>;
  getOrCreateLocationState(locationId: LocationId): Promise<LocationState>;
  getOrCreateLocationMessagesState(
    locationId: LocationId
  ): Promise<LocationMessagesState>;
  getOrCreateLocationEntityState(
    locationId: LocationId,
    type: EntityType,
    entityId: EntityId
  ): Promise<LocationEntityState>;
  getOrCreateLocationEntityStates(
    locationId: LocationId,
    agentIds: AgentId[],
    userIds: UserId[]
  ): Promise<LocationEntityState[]>;

  addLocationStateAgentId(
    locationId: LocationId,
    agentId: AgentId
  ): Promise<boolean>;
  removeLocationStateAgentId(
    locationId: LocationId,
    agentId: AgentId
  ): Promise<boolean>;
  addLocationStateUserId(
    locationId: LocationId,
    userId: UserId
  ): Promise<boolean>;
  removeLocationStateUserId(
    locationId: LocationId,
    userId: UserId
  ): Promise<boolean>;
  updateLocationStatePauseUpdateUntil(
    locationId: LocationId,
    pauseUpdateUntil: Date | null
  ): Promise<void>;
  updateLocationStateImage(
    locationId: LocationId,
    index: number,
    image: string
  ): Promise<void>;
  addLocationMessage(
    locationId: LocationId,
    message: LocationMessage,
    slice?: number
  ): Promise<boolean>;
  updateLocationEntityStateIsActive(
    locationId: LocationId,
    targetType: EntityType,
    targetId: EntityId,
    isActive: boolean
  ): Promise<void>;
  updateLocationEntityStateExpression(
    locationId: LocationId,
    targetType: EntityType,
    targetId: EntityId,
    expression: string
  ): Promise<void>;
}
