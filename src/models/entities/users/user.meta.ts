import { EntityMeta } from '../entity.meta';

export interface UserMeta extends EntityMeta {}

export const DEFAULT_USER_META: UserMeta = {
  appearance: 'Typical human',
  role: 'User',
};
