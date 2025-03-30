import type { Location } from '@little-samo/samo-ai/models/locations/location';

import { EntityContext } from './entity.context';
import { EntityState } from './entity.state';
import { EntityMeta } from './entity.meta';
import {
  EntityId,
  EntityKey,
  EntityType,
  ItemDataId,
  ItemKey,
} from './entity.types';
import { ItemModel } from './entity.item-model';

export abstract class Entity {
  protected _meta: EntityMeta;
  protected _state: EntityState;

  protected _itemsByItemKey: Record<ItemKey, ItemModel> = {};
  protected _itemsByDataId: Record<ItemDataId, ItemModel[]> = {};

  protected constructor(
    public readonly location: Location,
    public readonly name: string,
    meta: EntityMeta,
    state: EntityState,
    items: ItemModel[] = []
  ) {
    this._meta = meta;
    this._state = state;
    this.setItems(items);
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
      items: this._itemsByItemKey,
      canvases: [],
    });
  }

  public setItems(items: ItemModel[]): void {
    this._itemsByDataId = {};
    this._itemsByItemKey = {};

    for (const item of items) {
      const itemKey = `item:${item.id}` as ItemKey;
      this._itemsByItemKey[itemKey] = item;

      this._itemsByDataId[item.itemDataId as ItemDataId] ??= [];
      this._itemsByDataId[item.itemDataId as ItemDataId].push(item);
    }
  }

  public getItemByItemKey(itemKey: ItemKey): ItemModel | null {
    return this._itemsByItemKey[itemKey] ?? null;
  }

  public getItemsByDataId(dataId: ItemDataId): ItemModel[] {
    return this._itemsByDataId[dataId] ?? [];
  }

  public getItemByDataId(dataId: ItemDataId): ItemModel | null {
    return this._itemsByDataId[dataId]?.at(0) ?? null;
  }

  public abstract createItem(itemDataId: ItemDataId): ItemModel;

  public async addItem(
    dataId: ItemDataId,
    count: number,
    options: {
      stackable?: boolean;
      emitEvent?: boolean;
    } = {}
  ): Promise<void> {
    const { stackable = true, emitEvent = true } = options;

    if (emitEvent) {
      await this.location.emitAsync(
        'entityAddItem',
        this,
        dataId,
        count,
        stackable
      );
    }

    if (stackable) {
      const item = this.getItemByDataId(dataId);
      if (item) {
        item.count += count;
      } else {
        const item = this.createItem(dataId);
        item.count = count;

        this._itemsByDataId[dataId] ??= [];
        this._itemsByDataId[dataId].push(item);
      }
    } else {
      this._itemsByDataId[dataId] ??= [];
      for (let i = 0; i < count; i++) {
        const item = this.createItem(dataId);
        item.count = 1;
        this._itemsByDataId[dataId].push(item);
      }
    }
  }

  public async removeItem(
    item: ItemModel,
    count: number,
    options: {
      emitEvent?: boolean;
    } = {}
  ): Promise<boolean> {
    const { emitEvent = true } = options;

    if (item.count < count) {
      return false;
    }

    try {
      if (emitEvent) {
        await this.location.emitAsync('entityRemoveItem', this, item, count);
      }
    } catch (error) {
      console.error(
        `Error removing item ${item.itemData?.name ?? item.itemDataId} from entity ${this.key}:`,
        error
      );
      return false;
    }

    item.count -= count;

    return true;
  }

  public abstract update(): Promise<boolean>;

  public async transferItem(
    item: ItemModel,
    count: number,
    targetEntityKey: EntityKey,
    options: {
      emitEvent?: boolean;
    } = {}
  ): Promise<boolean> {
    const { emitEvent = true } = options;

    const targetEntity = this.location.entities[targetEntityKey];
    if (!targetEntity) {
      return false;
    }

    const stackable = item.itemData?.stackable ?? true;

    if (await this.removeItem(item, count, { emitEvent: false })) {
      await targetEntity.addItem(item.itemDataId as ItemDataId, count, {
        stackable,
        emitEvent: false,
      });

      if (emitEvent) {
        try {
          await this.location.emitAsync(
            'entityItemTransferred',
            this,
            item,
            count,
            targetEntityKey
          );
        } catch (error) {
          console.error(
            `Error transferring item ${item.itemData?.name ?? item.itemDataId} from ${this.key} to ${targetEntityKey}:`,
            error
          );
          return false;
        }
      }

      return true;
    }

    return false;
  }
}
