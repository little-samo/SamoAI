import { Location } from '@little-samo/samo-ai/models/locations/location';

import { Entity } from '../entity';
import { EntityType } from '../entity.types';

import { UserState } from './states/user.state';
import { DEFAULT_USER_META, UserMeta } from './user.meta';
import { UserModel } from './user.model';
import { UserId } from './user.types';

export class User extends Entity {
  public static createState(model: UserModel, _meta: UserMeta): UserState {
    const state: UserState = {
      userId: model.id as UserId,
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    return state;
  }

  public static fixState(_state: UserState, _meta: UserMeta): void {}

  public constructor(
    location: Location,
    public readonly model: UserModel,
    state?: null | UserState
  ) {
    const meta = { ...DEFAULT_USER_META, ...(model.meta as object) };
    state ??= User.createState(model, meta);
    User.fixState(state, meta);

    super(location, model.nickname, meta, state);
  }

  public override get type(): 'user' {
    return EntityType.USER;
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

  public async update(): Promise<boolean> {
    return true;
  }
}
