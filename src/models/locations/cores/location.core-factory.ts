import { Location } from '../location';
import { LocationCoreMeta } from '../location.meta';

import { LocationCore } from './location.core';

export class LocationCoreFactory {
  public static readonly CORE_MAP: Record<
    string,
    new (location: Location, meta: LocationCoreMeta) => LocationCore
  > = {};

  public static createCore(location: Location): LocationCore {
    let coreMeta: LocationCoreMeta;
    if (typeof location.meta.core === 'string') {
      coreMeta = { name: location.meta.core };
    } else {
      coreMeta = location.meta.core;
    }
    const CoreClass = this.CORE_MAP[coreMeta.name];
    if (!CoreClass) {
      throw new Error(`Unknown location core: ${coreMeta.name}`);
    }
    return new CoreClass(location, coreMeta);
  }
}
