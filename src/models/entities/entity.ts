import { EntityState } from './entity.state.js';

export type EntityId = number & { __entityId: true };

export abstract class Entity {
  private static _idCounter = 0;

  public static generateId(): EntityId {
    return ++Entity._idCounter as EntityId;
  }

  public readonly id: EntityId;
  protected _state: EntityState;

  protected constructor(
    public readonly name: string,
    state: EntityState
  ) {
    this.id = Entity.generateId();
    this._state = state;
  }

  public get state(): EntityState {
    return this._state;
  }

  public abstract update(): Promise<void>;
}
