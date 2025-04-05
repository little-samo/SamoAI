import { shuffle } from '@little-samo/samo-ai/common';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('update_once')
export class LocationUpdateOnceCore extends LocationCore {
  public async update(): Promise<number> {
    const entities = Object.values(this.location.entities);
    if (!this.meta.sequential) {
      shuffle(entities);
    }
    for (const entity of entities) {
      await entity.update();
    }
    return 0;
  }
}
