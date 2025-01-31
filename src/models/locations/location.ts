import { EventEmitter } from 'events';

import { LocationModel } from '@prisma/client';

import { LocationState } from './states/location.state';

export type LocationId = number & { __locationId: true };

export class Location extends EventEmitter {
  public readonly id: LocationId;

  protected constructor(
    public readonly model: LocationModel,
    public state: LocationState
  ) {
    super();
    this.id = model.id as LocationId;
  }
}
