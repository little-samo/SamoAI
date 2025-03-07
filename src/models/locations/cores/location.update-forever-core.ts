import { shuffle } from '@little-samo/samo-ai';

import { RegisterLocationCore } from './location.core-decorator';
import { LocationCore } from './location.core';

@RegisterLocationCore('update_forever')
export class LocationUpdateForeverCore extends LocationCore {
  public static readonly UPDATE_INTERVAL = 1000; // 1 seconds

  public async update(): Promise<number> {
    const entities = Object.values(this.location.entities);
    shuffle(entities);
    for (const entity of entities) {
      if (await entity.update()) {
        return LocationUpdateForeverCore.UPDATE_INTERVAL;
      }
    }
    return LocationUpdateForeverCore.UPDATE_INTERVAL;
  }
}
