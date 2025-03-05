import { RegisterLocationCore } from './location.core-decorator';
import { LocationCore } from './location.core';

@RegisterLocationCore('update_once')
export class LocationUpdateOnceCore extends LocationCore {
  public async update(): Promise<number> {
    for (const entity of Object.values(this.location.entities)) {
      await entity.update();
    }
    return 0;
  }
}
