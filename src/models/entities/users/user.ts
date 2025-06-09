import { type Location } from '../../locations';
import { Entity } from '../entity';
import { ItemModel } from '../entity.item-model';
import { EntityType, ItemId } from '../entity.types';

import { UserState } from './states/user.state';
import { UserContext } from './user.context';
import { DEFAULT_USER_META, UserMeta } from './user.meta';
import { UserModel } from './user.model';
import { UserId } from './user.types';

export class User extends Entity {
  private static _createEmptyState(userId: UserId): UserState {
    return {
      userId,
      updatedAt: new Date(),
      createdAt: new Date(),
    };
  }

  public static fixState(_state: UserState, _meta: UserMeta): void {}

  public constructor(
    location: Location,
    public readonly model: UserModel,
    options: {
      state?: UserState;
      items?: ItemModel[];
    } = {}
  ) {
    const meta = { ...DEFAULT_USER_META, ...(model.meta as object) };
    const state = options.state ?? User._createEmptyState(model.id as UserId);
    const items = options.items ?? [];
    User.fixState(state, meta);

    super(location, model.nickname, meta, state, items);
  }

  public override get type(): 'user' {
    return EntityType.User;
  }

  public override get id(): UserId {
    return this.model.id as UserId;
  }

  public override get meta(): UserMeta {
    return super.meta as UserMeta;
  }

  public set meta(value: UserMeta) {
    this._meta = value;
  }

  public override get state(): UserState {
    return super.state as UserState;
  }

  public set state(value: UserState) {
    this._state = value;
  }

  public override get context(): UserContext {
    return new UserContext({
      ...super.context,
      handle: this.model.username ?? undefined,
    });
  }

  public override createItem(itemDataId: number): ItemModel {
    return {
      id: 0 as ItemId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerAgentId: null,
      ownerUserId: this.id,
      itemDataId,
      count: 0,
    };
  }

  public async update(): Promise<boolean> {
    await super.update();
    return false;
  }
}
