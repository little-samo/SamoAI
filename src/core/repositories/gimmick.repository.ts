import {
  EntityId,
  EntityType,
  GimmickId,
  GimmickState,
  LocationId,
} from '@little-samo/samo-ai/models';

export interface GimmickRepository {
  getOrCreateGimmickState(
    locationId: LocationId,
    gimmickId: GimmickId
  ): Promise<GimmickState>;
  getOrCreateGimmickStates(
    locationId: LocationId,
    gimmickIds: GimmickId[]
  ): Promise<Record<GimmickId, GimmickState>>;

  updateGimmickStateOccupier(
    locationId: LocationId,
    gimmickId?: GimmickId,
    occupierType?: EntityType,
    occupierId?: EntityId,
    occupationUntil?: Date
  ): Promise<void>;
}
