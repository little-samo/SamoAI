import { ENV, shuffle } from '@little-samo/samo-ai/common';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('update_until_idle')
export class LocationUpdateUntilIdleCore extends LocationCore {
  public static readonly UPDATE_INTERVAL = 2000; // 2 seconds

  public override get defaultPauseUpdateDuration(): number {
    return LocationUpdateUntilIdleCore.UPDATE_INTERVAL;
  }

  public async update(): Promise<number> {
    const entities = this.location.getEntities();
    if (!this.meta.sequential) {
      shuffle(entities);
    }
    for (const entity of entities) {
      if (await entity.update()) {
        if (ENV.DEBUG) {
          console.log(`[${entity.key}] ${entity.name} executed`);
        }
        return LocationUpdateUntilIdleCore.UPDATE_INTERVAL;
      }
    }
    if (ENV.DEBUG) {
      console.log('No entities executed - stopping update loop');
    }
    return 0; // Stop updating when no actions are available
  }
}
