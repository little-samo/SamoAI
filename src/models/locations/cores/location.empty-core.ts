import { Location } from '../location';

import { LocationCore } from './location.core';

export class LocationEmptyCore extends LocationCore {
  public static readonly CORE_TYPE = 'empty';

  public constructor(location: Location) {
    super(location);
  }
}
