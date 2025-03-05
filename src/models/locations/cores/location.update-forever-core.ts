import { RegisterLocationCore } from './location.core-decorator';
import { LocationCore } from './location.core';

@RegisterLocationCore('update_forever')
export class LocationUpdateForeverCore extends LocationCore {
  public static readonly UPDATE_INTERVAL = 1000;

  public async update(): Promise<number> {
    for (const entity of Object.values(this.location.entities)) {
      await entity.update();
    }
    return LocationUpdateForeverCore.UPDATE_INTERVAL;
  }
}
