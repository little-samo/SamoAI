import { EntityState } from '@little-samo/samo-ai/models/entities/entity.state';

import { UserId } from '../user.types';

export interface UserState extends EntityState {
  userId: UserId;
}
