import { UserModel } from '@prisma/client';

import { Entity } from '../entity.js';

export class User extends Entity {
  public constructor(public readonly model: UserModel) {
    super(model.nickname);
  }

  public async update(): Promise<void> {}
}
