import { shuffle } from '@little-samo/samo-ai/common';

import { EntityType } from '../../entities';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('update_once')
export class LocationUpdateOnceCore extends LocationCore {
  public async update(): Promise<number> {
    const agents = this.location.getAgents();
    const lastMessage = this.location.messages.at(-1);

    if (
      this.meta.fast &&
      agents.filter((agent) => agent.core.name !== 'no_action').length === 1 &&
      lastMessage?.entityType === EntityType.User
    ) {
      await agents
        .filter((agent) => agent.core.name !== 'no_action')[0]
        .executeNextActions();
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
