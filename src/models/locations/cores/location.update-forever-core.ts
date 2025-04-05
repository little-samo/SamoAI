import { ENV, shuffle } from '@little-samo/samo-ai/common';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('update_forever')
export class LocationUpdateForeverCore extends LocationCore {
  public static readonly UPDATE_INTERVAL = 3000; // 3 seconds
  public static readonly SLEEP_INTERVAL = 0; // pause

  public async update(): Promise<number> {
    const entities = Object.values(this.location.entities);
    if (!this.meta.sequential) {
      shuffle(entities);
    }
    for (const entity of entities) {
      if (await entity.update()) {
        if (ENV.DEBUG) {
          console.log(`[${entity.key}] ${entity.name} executed`);
        }
        return LocationUpdateForeverCore.UPDATE_INTERVAL;
      }
    }
    if (ENV.DEBUG) {
      console.log('No entities executed');
    }
    return LocationUpdateForeverCore.SLEEP_INTERVAL;
  }
}
