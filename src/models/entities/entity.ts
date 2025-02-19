import { Location } from '@models/locations/location';

import { EntityContext } from './entity.context';
import { EntityState } from './entity.state';
import { EntityMeta } from './entity.meta';
import { EntityKey, EntityType } from './entity.types';

export abstract class Entity {
  public static readonly TYPE: EntityType;

  protected _meta: EntityMeta;
  protected _state: EntityState;

  protected constructor(
    public readonly location: Location,
    public readonly name: string,
    meta: EntityMeta,
    state: EntityState
  ) {
    this._meta = meta;
    this._state = state;
  }

  public abstract get id(): number;

  public get type(): EntityType {
    return (this.constructor as typeof Entity).TYPE;
  }

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
    });
  }

  public abstract update(): Promise<void>;
}
