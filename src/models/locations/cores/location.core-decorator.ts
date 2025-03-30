import { LOCATION_CORE_METADATA_KEY } from './location.core-constants';
import { LocationCoreFactory } from './location.core-factory';

import type { Location } from '../location';
import type { LocationCore } from './location.core';

export function RegisterLocationCore(core: string): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(LOCATION_CORE_METADATA_KEY, core, target);
    LocationCoreFactory.CORE_MAP[core] = target as new (
      location: Location
    ) => LocationCore;
  };
}
