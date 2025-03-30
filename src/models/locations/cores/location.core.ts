import { LOCATION_CORE_METADATA_KEY } from './location.core-constants';

import type { Location } from '../location';

export abstract class LocationCore {
  protected constructor(public readonly location: Location) {}

  public get name(): string {
    return Reflect.getMetadata(LOCATION_CORE_METADATA_KEY, this.constructor);
  }

  public abstract update(): Promise<number>;
}
