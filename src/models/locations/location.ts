import { EventEmitter } from 'events';

import { LocationModel } from '@prisma/client';

export type LocationId = number & { __locationId: true };

export abstract class Location extends EventEmitter {
  public readonly id: LocationId;

  protected constructor(public readonly model: LocationModel) {
    super();
    this.id = model.id as LocationId;
  }
}
