import { EntityState } from '../../entity.state';
import { EntityId, EntityType } from '../../entity.types';
import { GimmickId } from '../gimmick.types';

export interface GimmickState extends EntityState {
  gimmickId: GimmickId;

  occupierType?: EntityType;
  occupierId?: EntityId;
  occupationUntil?: Date;
}
