import { EntityMeta } from '../entity.meta';

export interface UserMeta extends EntityMeta {
  locationRules: string[];
}

export const DEFAULT_USER_META: UserMeta = {
  appearance: 'Typical human',

  locationRules: [],
};
