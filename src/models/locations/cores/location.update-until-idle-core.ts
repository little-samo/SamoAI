import { ENV, shuffle } from '@little-samo/samo-ai/common';

import { LocationCore } from './location.core';
import { RegisterLocationCore } from './location.core-decorator';

@RegisterLocationCore('update_until_idle')
export class LocationUpdateUntilIdleCore extends LocationCore {
  public static readonly DEFAULT_UPDATE_INTERVAL = 1000; // 1 second

  public override get defaultPauseUpdateDuration(): number {
    return (
      this.meta.interval ?? LocationUpdateUntilIdleCore.DEFAULT_UPDATE_INTERVAL
    );
  }

  public async update(): Promise<number> {
    const agents = this.location.getAgents();
    if (!this.meta.sequential) {
      shuffle(agents);
    }
    for (const agent of agents) {
      if (await agent.update()) {
        if (ENV.DEBUG) {
          console.log(`[${agent.key}] ${agent.name} executed`);
        }
        return this.defaultPauseUpdateDuration;
      }
    }
    if (ENV.DEBUG) {
      console.log('No agents executed - stopping update loop');
    }
    return 0; // Stop updating when no actions are available
  }
}
