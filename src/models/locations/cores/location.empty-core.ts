import { Location } from '../location.js';

import { LocationCore } from './location.core.js';

export class LocationEmptyCore extends LocationCore {
  public constructor(location: Location) {
    super(location);
  }
}
