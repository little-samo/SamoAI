import { Location } from '@little-samo/samo-ai/models/locations/location';

import { EntityContext } from './entity.context';
import { EntityState } from './entity.state';
import { EntityMeta } from './entity.meta';
import { EntityId, EntityKey, EntityType } from './entity.types';
import { ItemModel } from './entity.item-model';

export abstract class Entity {
  protected _meta: EntityMeta;
  protected _state: EntityState;

  protected readonly _itemsByDataId: Record<number, ItemModel[]> = {};

  protected constructor(
    public readonly location: Location,
    public readonly name: string,
    meta: EntityMeta,
    state: EntityState,
    items: ItemModel[] = []
  ) {
    this._meta = meta;
    this._state = state;

    for (const item of items) {
      this._itemsByDataId[item.itemDataId] ??= [];
      this._itemsByDataId[item.itemDataId].push(item);
    }
  }

  public abstract get id(): EntityId;

  public abstract get type(): EntityType;

  public get key(): EntityKey {
    return `${this.type}:${this.id}` as EntityKey;
  }

  public get meta(): EntityMeta {
    return this._meta;
  }

  public get state(): EntityState {
    return this._state;
  }

  public get context(): EntityContext {
    const entityState = this.location.getEntityState(this.key);
    return new EntityContext({
      key: this.key,
      name: this.name,
      appearance: this.meta.appearance,
      expression: entityState?.expression ?? undefined,
      items: this._itemsByDataId,
    });
  }

  public getItemsByDataId(dataId: number): ItemModel[] {
    return this._itemsByDataId[dataId] ?? [];
  }

  public getItemByDataId(dataId: number): ItemModel | null {
    return this._itemsByDataId[dataId]?.at(0) ?? null;
  }

  public abstract update(): Promise<boolean>;
}
