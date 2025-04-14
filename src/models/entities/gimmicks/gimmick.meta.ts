import { EntityMeta } from '../entity.meta';

export interface GimmickCoreMeta {
  name: string;
  options?: Record<string, unknown>;
}

export interface GimmickMeta extends EntityMeta {
  core: string | GimmickCoreMeta;

  name: string;
  description?: string;
  appearance: string;
}
