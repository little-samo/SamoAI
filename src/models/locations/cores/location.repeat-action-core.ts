import { Location } from '../location';

import { LocationCore } from './location.core';

export class LocationRepeatActionCore extends LocationCore {
  public static readonly CORE_TYPE = 'repeat_action';

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
  }
}
