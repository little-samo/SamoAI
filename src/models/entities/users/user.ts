import { UserModel } from '@prisma/client';
import { Location } from '@models/locations/location';

import { Entity, EntityKey } from '../entity';

import { UserState } from './states/user.state';
import { DEFAULT_USER_META, UserMeta } from './user.meta';

export class User extends Entity {
  public readonly key: EntityKey;

  public static createState(model: UserModel, _meta: UserMeta): UserState {
    const state = new UserState();
    state.userId = model.id;
    return state;
  }

  public static fixState(_state: UserState, _meta: UserMeta): void {}

  public constructor(
    location: Location,
    public readonly model: UserModel,
    state?: UserState
  ) {
    const meta = { ...DEFAULT_USER_META, ...(model.meta as object) };
    state ??= User.createState(model, meta);
    User.fixState(state, meta);

    super(location, model.nickname, meta, state);
    this.key = `user:${model.id}` as EntityKey;
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

  public async update(): Promise<void> {}
}
