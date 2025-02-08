import { sleepWithAbort } from '@common/utils/sleep';
import { Entity } from '@models/entities/entity';

import { Location } from '../location';

import { LocationEmptyCore } from './location.empty-core';

export abstract class LocationCore {
  private _sleepController = new AbortController();

  private _entities: Map<string, Entity> = new Map();

  private _destroyed = false;

  protected constructor(public readonly location: Location) {}

  public get destroyed(): boolean {
    return this._destroyed;
  }

  public get tick(): number {
    return 1;
  }

  public static createCore(location: Location): LocationCore {
    switch (location.meta.core) {
      case '':
      case 'empty':
        return new LocationEmptyCore(location);
      default:
        throw new Error(`Unknown location core: ${location.meta.core}`);
    }
  }

  public async run(): Promise<void> {
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
      Array.from(this._entities.values()).map((entity) => entity.update())
    );
  }

  public resume(): void {
    this._sleepController.abort();
  }

  public destroy(): void {
    this._destroyed = true;
  }
}
