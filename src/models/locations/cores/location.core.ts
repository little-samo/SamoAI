import { Location } from '../location';

export abstract class LocationCore {
  protected constructor(public readonly location: Location) {}

  public async update(): Promise<number> {
    await Promise.all(
      Array.from(Object.values(this.location.entities)).map((entity) =>
        entity.update()
      )
    );
    return 0;
  }
}
