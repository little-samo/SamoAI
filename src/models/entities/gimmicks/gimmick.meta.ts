import { type LocationEntityCanvasMeta } from '../../locations';
import { EntityMeta } from '../entity.meta';
import { type EntityKey } from '../entity.types';

export interface GimmickCoreOptions {
  [key: string]: unknown;
}

export interface GimmickEntityArguments {
  [key: string]: unknown;
}

export interface GimmickCoreMeta {
  name: string;
  canvas?: LocationEntityCanvasMeta;
  options?: GimmickCoreOptions;
  entityArguments?: Record<EntityKey, GimmickEntityArguments>;
}

export interface GimmickMeta extends EntityMeta {
  core: string | GimmickCoreMeta;

  name: string;
  description?: string;
  appearance: string;
}
