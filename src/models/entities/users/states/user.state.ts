import { EntityState } from '../../entity.state';
import { UserId } from '../user.types';

export interface UserState extends EntityState {
  userId: UserId;
}
