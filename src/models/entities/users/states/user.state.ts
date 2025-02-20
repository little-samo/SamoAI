import { EntityState } from '@little-samo/samo-ai/models/entities/entity.state';
import { UserId } from '@little-samo/samo-ai/models/entities/entity.types';

export interface UserState extends EntityState {
  userId: UserId;
}
