import { Location } from '@little-samo/samo-ai/models/locations/location';
import { isEqual } from 'lodash';

import { Entity } from '../entity';
import { ItemModel } from '../entity.item-model';
import { EntityType } from '../entity.types';

import { GimmickCoreFactory } from './cores';
import { GimmickCore } from './cores/gimmick.core';
import { GimmickMeta } from './gimmick.meta';
import { GimmickId } from './gimmick.types';
import { GimmickState } from './states/gimmick.state';

export class Gimmick extends Entity {
  private static _createEmptyState(gimmickId: GimmickId): GimmickState {
    return {
      gimmickId,
      updatedAt: new Date(),
      createdAt: new Date(),
    };
  }

  public static fixState(_state: GimmickState, _meta: GimmickMeta): void {}

  public core!: GimmickCore;

  public constructor(
    location: Location,
    public readonly id: GimmickId,
    meta: GimmickMeta,
    options: {
      state?: GimmickState;
    } = {}
  ) {
    const state = options.state ?? Gimmick._createEmptyState(id);
    Gimmick.fixState(state, meta);

    super(location, meta.name, meta, state);

    this.reloadCore();
  }

  public override get type(): 'gimmick' {
    return EntityType.Gimmick;
  }

  public override get meta(): GimmickMeta {
    return super.meta as GimmickMeta;
  }

  public set meta(value: GimmickMeta) {
    this._meta = value;
  }

  public override get state(): GimmickState {
    return super.state as GimmickState;
  }

  public set state(value: GimmickState) {
    this._state = value;
  }

  public override createItem(_itemDataId: number): ItemModel {
    throw new Error('Gimmicks do not have items');
  }

  public reloadCore(): void {
    if (this.core) {
      const coreMeta =
        typeof this.meta.core === 'string'
          ? { name: this.meta.core }
          : this.meta.core;
      if (isEqual(this.core.meta, coreMeta)) {
        return;
      }
    }
    this.core = GimmickCoreFactory.createCore(this);
  }

  public async update(): Promise<boolean> {
    this.reloadCore();
    return await this.core.update();
  }
}
