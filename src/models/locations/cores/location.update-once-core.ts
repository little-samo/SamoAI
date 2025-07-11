import { shuffle } from '@little-samo/samo-ai/common';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('update_once')
export class LocationUpdateOnceCore extends LocationCore {
  public async update(): Promise<number> {
    const entities = this.location.getEntities();
    if (!this.meta.sequential) {
      shuffle(entities);
    }
    for (const entity of entities) {
      if (await entity.update()) {
        break;
      }
    }
    return 0;
  }
}
