import { GIMMICK_CORE_METADATA_KEY } from './gimmick.core-constants';
import { GimmickCoreFactory } from './gimmick.core-factory';

import type { Gimmick } from '../gimmick';
import type { GimmickCore } from './gimmick.core';

export function RegisterGimmickCore(core: string): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(GIMMICK_CORE_METADATA_KEY, core, target);
    GimmickCoreFactory.CORE_MAP[core] = target as new (
      gimmick: Gimmick
    ) => GimmickCore;
  };
}
