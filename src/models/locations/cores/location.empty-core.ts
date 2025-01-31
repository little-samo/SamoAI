import { Location } from '../location';

import { LocationCore } from './location.core';

export class LocationEmptyCore extends LocationCore {
  public constructor(location: Location) {
    super(location);
  }
}
