import { EntityState } from './entity.state.js';

export type EntityId = number & { __entityId: true };

export abstract class Entity {
  private static _idCounter = 0;

  public static generateId(): EntityId {
    return ++Entity._idCounter as EntityId;
  }

  public readonly id: EntityId;

  protected constructor(
    public readonly name: string,
    private readonly state: EntityState
  ) {
    this.id = Entity.generateId();
  }

  public abstract update(): Promise<void>;
}
