import { Location } from '../location';

import { RegisterLocationCore } from './location.core-decorator';
import { LocationCore } from './location.core';

@RegisterLocationCore('empty')
export class LocationEmptyCore extends LocationCore {
  public constructor(location: Location) {
    super(location);
  }
}
