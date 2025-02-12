import { sleepWithAbort } from '@common/utils/sleep';

import { Location } from '../location';

export abstract class LocationCore {
  private _sleepController = new AbortController();

  private _destroyed = false;

  protected constructor(public readonly location: Location) {}

  public get destroyed(): boolean {
    return this._destroyed;
  }

  public get tick(): number {
    return 0;
  }

  public async run(): Promise<void> {
    if (this.tick <= 0) {
      throw new Error(`${this.constructor.name} is not runnable`);
    }

    while (!this._destroyed) {
      const updateStartAt = Date.now();
      let waitTime = 1;
      try {
        await this.update();
        waitTime = this.tick - (Date.now() - updateStartAt);
      } catch (error) {
        console.error(
          `Location ${this.location.model.name} run failed: ${error}`
        );
      }

      if (waitTime > 0) {
        this._sleepController = new AbortController();
        await sleepWithAbort(waitTime, this._sleepController.signal);
      }
    }
  }

  public async update(): Promise<void> {
    await Promise.all(
      Array.from(Object.values(this.location.entities)).map((entity) =>
        entity.update()
      )
    );
  }

  public resume(): void {
    this._sleepController.abort();
  }

  public destroy(): void {
    this._destroyed = true;
  }
}
