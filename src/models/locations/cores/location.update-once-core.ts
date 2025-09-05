import { shuffle } from '@little-samo/samo-ai/common';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('update_once')
export class LocationUpdateOnceCore extends LocationCore {
  public async update(): Promise<number> {
    const agents = this.location.getAgents();

    if (this.meta.fast && agents.length === 1) {
      await agents[0].executeNextActions();
      return 0;
    }

    if (!this.meta.sequential) {
      shuffle(agents);
    }
    for (const agent of agents) {
      if (await agent.update()) {
        break;
      }
    }
    return 0;
  }
}
