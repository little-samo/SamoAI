import { UserModel } from '@prisma/client';

import { Entity } from '../entity';

import { UserState } from './states/user.state';

export class User extends Entity {
  public constructor(
    public readonly model: UserModel,
    initialState: UserState
  ) {
    super(model.nickname, initialState);
  }

  public override get state(): UserState {
    return super.state as UserState;
  }

  public set state(value: UserState) {
    this._state = value;
  }

  public async update(): Promise<void> {}
}
