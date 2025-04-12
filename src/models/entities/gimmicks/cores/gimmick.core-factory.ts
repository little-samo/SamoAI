import { Gimmick } from '../gimmick';
import { GimmickCoreMeta } from '../gimmick.meta';

import { GimmickCore } from './gimmick.core';

export class GimmickCoreFactory {
  public static readonly CORE_MAP: Record<
    string,
    new (gimmick: Gimmick, meta: GimmickCoreMeta) => GimmickCore
  > = {};

  public static createCore(gimmick: Gimmick): GimmickCore {
    let coreMeta: GimmickCoreMeta;
    if (typeof gimmick.meta.core === 'string') {
      coreMeta = { name: gimmick.meta.core };
    } else {
      coreMeta = gimmick.meta.core;
    }
    const CoreClass = this.CORE_MAP[coreMeta.name];
    if (!CoreClass) {
      throw new Error(`Unknown gimmick core: ${coreMeta.name}`);
    }
    return new CoreClass(gimmick, coreMeta);
  }
}
