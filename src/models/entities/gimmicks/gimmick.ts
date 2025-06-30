import { isEqual } from 'lodash';

import { type Location } from '../../locations';
import { LocationId } from '../../locations/location.types';
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
    if (state.occupationUntil && new Date(state.occupationUntil) < new Date()) {
      state.occupierType = undefined;
      state.occupierId = undefined;
      state.occupationUntil = undefined;
      state.occupationReason = undefined;
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
    const context = new GimmickContext({
      ...super.context,
      description: this.meta.description ?? this.core.description,
      occupierId: this.state.occupierId,
      occupierType: this.state.occupierType,
      occupationUntil: this.state.occupationUntil,
      occupationReason: this.state.occupationReason,
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

  public async occupy(
    entity: Entity,
    duration?: number,
    reason?: string
  ): Promise<boolean> {
    if (this.state.occupierType) {
      return false;
    }
    this.state.occupierType = entity.type;
    this.state.occupierId = entity.id;
    this.state.occupationUntil = duration
      ? new Date(Date.now() + duration)
      : new Date(Date.now() + Gimmick.DEFAULT_OCCUPATION_DURATION);
    this.state.occupationReason = reason;

    await this.location.emitAsync(
      'gimmickOccupied',
      this,
      entity,
      this.state.occupationUntil,
      this.state.occupationReason
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
    this.state.occupationReason = undefined;

    await this.location.emitAsync('gimmickReleased', this);

    return true;
  }

  public async init(): Promise<void> {
    await super.init();
    this.reloadCore();
    await this.core.init();
  }

  public async update(): Promise<boolean> {
    await super.update();
    return await this.core.update();
  }

  public async execute(
    entity: Entity,
    parameters: GimmickParameters,
    reason?: string,
    force: boolean = false
  ): Promise<string | undefined> {
    if (!this.isExecutable && !force) {
      return 'Gimmick is not executable';
    }

    if (this.core.canvas) {
      await entity.updateCanvas(this.core.canvas.name, '');
    }

    await this.location.emitAsync(
      'gimmickExecute',
      this,
      entity,
      parameters,
      reason
    );

    return await this.core.execute(entity, parameters);
  }
}
