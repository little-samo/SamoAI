import { type LocationEntityCanvasMeta } from '../../locations';
import { EntityMeta } from '../entity.meta';

export interface GimmickCoreOptions {
  [key: string]: unknown;
}

export interface GimmickCoreMeta {
  name: string;
  canvas?: LocationEntityCanvasMeta;
  options?: GimmickCoreOptions;
}

export interface GimmickMeta extends EntityMeta {
  core: string | GimmickCoreMeta;

  name: string;
  description?: string;
  appearance: string;
}
