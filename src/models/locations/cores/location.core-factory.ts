import { Location } from '../location';

import { LocationCore } from './location.core';

export class LocationCoreFactory {
  public static readonly CORE_MAP: Record<
    string,
    new (location: Location) => LocationCore
  > = {};

  public static createCore(location: Location): LocationCore {
    const CoreClass = this.CORE_MAP[location.meta.core];
    if (!CoreClass) {
      throw new Error(`Unknown location core: ${location.meta.core}`);
    }
    return new CoreClass(location);
  }
}
