import {
  LocationState,
  LocationEntityState,
  LocationId,
  EntityId,
  EntityType,
  AgentId,
  UserId,
  GimmickId,
  LocationModel,
  LocationMessage,
} from '@little-samo/samo-ai';

export interface LocationRepository {
  getLocationModel(locationId: LocationId): Promise<LocationModel>;
  getOrCreateLocationState(locationId: LocationId): Promise<LocationState>;
  getLocationMessages(
    locationId: LocationId,
    limit: number
  ): Promise<LocationMessage[]>;
  getOrCreateLocationEntityState(
    locationId: LocationId,
    type: EntityType,
    entityId: EntityId
  ): Promise<LocationEntityState>;
  getOrCreateLocationEntityStates(
    locationId: LocationId,
    agentIds: AgentId[],
    userIds: UserId[],
    gimmickIds: GimmickId[]
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
    pauseUpdateUntil: Date | null,
    pauseUpdateReason?: string | null,
    pauseUpdateNextAgentId?: AgentId | null
  ): Promise<void>;
  updateLocationStateRemainingAgentExecutions(
    locationId: LocationId,
    value:
      | {
          remainingAgentExecutions: number | null;
        }
      | {
          remainingAgemtExecutionsDelta: number | null;
        }
  ): Promise<void>;
  updateLocationStateCanvas(
    locationId: LocationId,
    canvasName: string,
    modifierEntityType: EntityType,
    modifierEntityId: EntityId,
    text: string
  ): Promise<void>;
  updateLocationStateImage(
    locationId: LocationId,
    index: number,
    image: string
  ): Promise<void>;
  updateLocationStateRendering(
    locationId: LocationId,
    rendering: string | null
  ): Promise<void>;
  addLocationMessage(
    locationId: LocationId,
    message: LocationMessage
  ): Promise<void>;
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
  updateLocationEntityStateCanvas(
    locationId: LocationId,
    targetType: EntityType,
    targetId: EntityId,
    canvasName: string,
    text: string
  ): Promise<void>;
}
