import { Location } from '@little-samo/samo-ai/models/locations/location';
import { isEqual } from 'lodash';

import { LocationId } from '../../locations/location.type';
import { Entity } from '../entity';
import { ItemModel } from '../entity.item-model';
import { EntityType } from '../entity.types';

import { GimmickCoreFactory } from './cores';
import { GimmickCore } from './cores/gimmick.core';
import { GimmickContext } from './gimmick.context';
import { GimmickMeta } from './gimmick.meta';
import { GimmickId, GimmickParameters } from './gimmick.types';
import { GimmickState } from './states/gimmick.state';

export class Gimmick extends Entity {
  public static readonly DEFAULT_OCCUPATION_DURATION: number = 60 * 1000; // 1 minute

  private static _createEmptyState(
    locationId: LocationId,
    gimmickId: GimmickId
  ): GimmickState {
    return {
      locationId,
      gimmickId,
      updatedAt: new Date(),
      createdAt: new Date(),
    };
  }

  public static fixState(state: GimmickState, _meta: GimmickMeta): void {
    if (state.occupationUntil && state.occupationUntil < new Date()) {
      state.occupierType = undefined;
      state.occupierId = undefined;
      state.occupationUntil = undefined;
    }
  }

  public core!: GimmickCore;

  public constructor(
    location: Location,
    public readonly id: GimmickId,
    meta: GimmickMeta,
    options: {
      state?: GimmickState;
    } = {}
  ) {
    const state = options.state ?? Gimmick._createEmptyState(location.id, id);
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

  public override get context(): GimmickContext {
    this.reloadCore();
    const context = new GimmickContext({
      ...super.context,
      description: this.meta.description ?? this.core.description,
      occupierId: this.state.occupierId,
      occupierType: this.state.occupierType,
      occupationUntil: this.state.occupationUntil,
      parameters: this.core.parameters,
      canvas: this.core.canvas?.name,
    });
    return context;
  }

  public get isExecutable(): boolean {
    return this.state.occupierType === undefined;
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

  public async occupy(entity: Entity, duration?: number): Promise<boolean> {
    if (this.state.occupierType) {
      return false;
    }
    this.state.occupierType = entity.type;
    this.state.occupierId = entity.id;
    this.state.occupationUntil = duration
      ? new Date(Date.now() + duration)
      : new Date(Date.now() + Gimmick.DEFAULT_OCCUPATION_DURATION);

    await this.location.emitAsync(
      'gimmickOccupied',
      this,
      entity,
      this.state.occupationUntil
    );

    return true;
  }

  public async release(): Promise<boolean> {
    if (!this.state.occupierType) {
      return false;
    }
    this.state.occupierType = undefined;
    this.state.occupierId = undefined;
    this.state.occupationUntil = undefined;

    await this.location.emitAsync('gimmickReleased', this);

    return true;
  }

  public async update(): Promise<boolean> {
    this.reloadCore();
    return await this.core.update();
  }

  public async execute(
    entity: Entity,
    parameters: GimmickParameters,
    force: boolean = false
  ): Promise<boolean> {
    if (!this.isExecutable && !force) {
      return false;
    }

    await this.location.emitAsync('gimmickExecute', this, entity, parameters);

    return await this.core.execute(entity, parameters);
  }
}
