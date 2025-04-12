import { GimmickId, GimmickState } from '@little-samo/samo-ai/models';

export interface GimmickRepository {
  getOrCreateGimmickState(gimmickId: GimmickId): Promise<GimmickState>;
  getOrCreateGimmickStates(
    gimmickIds: GimmickId[]
  ): Promise<Record<GimmickId, GimmickState>>;
}
