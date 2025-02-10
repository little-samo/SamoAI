import { Location } from '../location';

import { LocationCore } from './location.core';
import { LocationEmptyCore } from './location.empty-core';
import { LocationRepeatActionCore } from './location.repeat-action-core';

export class LocationCoreFactory {
  public static readonly CORE_MAP: Record<
    string,
    new (location: Location) => LocationCore
  > = {
    [LocationEmptyCore.CORE_TYPE]: LocationEmptyCore,
    [LocationRepeatActionCore.CORE_TYPE]: LocationRepeatActionCore,
  };

  public static createCore(location: Location): LocationCore {
    const CoreClass = this.CORE_MAP[location.meta.core];
    if (!CoreClass) {
      throw new Error(`Unknown location core: ${location.meta.core}`);
    }
    return new CoreClass(location);
  }
}
