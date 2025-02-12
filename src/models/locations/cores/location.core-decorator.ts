import { Location } from '../location';

import { LocationCore } from './location.core';
import { LocationCoreFactory } from './location.core-factory';

export const LOCATION_CORE_METADATA_KEY = 'location:core';

export function RegisterLocationCore(core: string): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(LOCATION_CORE_METADATA_KEY, core, target);
    LocationCoreFactory.CORE_MAP[core] = target as new (
      location: Location
    ) => LocationCore;
  };
}
