import { LocationCoreMeta } from '../location.meta';

import type { Location } from '../location';

export abstract class LocationCore {
  protected constructor(
    public readonly location: Location,
    public readonly meta: LocationCoreMeta
  ) {}

  public get name(): string {
    return this.meta.name;
  }

  public abstract update(): Promise<number>;
}
