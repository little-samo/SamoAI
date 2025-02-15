import { Location } from '@models/locations/location';

import { EntityContext } from './entity.context';
import { EntityState } from './entity.state';
import { EntityMeta } from './entity.meta';

export type EntityKey = string & { __entityKey: true };

export abstract class Entity {
  public abstract get key(): EntityKey;

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

  public get meta(): EntityMeta {
    return this._meta;
  }

  public get state(): EntityState {
    return this._state;
  }

  public get context(): EntityContext {
    return {
      key: this.key,
      name: this.name,
      appearance: this.meta.appearance,
      expression: this.state.expression,
    };
  }

  public abstract update(): Promise<void>;
}
