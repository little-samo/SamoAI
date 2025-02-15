import { Location } from '../location';

import { RegisterLocationCore } from './location.core-decorator';
import { LocationCore } from './location.core';

@RegisterLocationCore('repeat_action')
export class LocationRepeatActionCore extends LocationCore {
  public constructor(location: Location) {
    super(location);
  }

  public async update(): Promise<void> {
    await super.update();
    await Promise.all(
      Object.values(this.location.agents).map((agent) =>
        agent.executeNextActions()
      )
    );

    if (this.location.state.pauseUpdateUntil) {
      this.location.state.pauseUpdateUntil = undefined;
      this.location.state.dirty = true;
    }
  }
}
