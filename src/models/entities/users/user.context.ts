import { EntityContext, EntityContextOptions } from '../entity.context';

export interface UserContextOptions extends EntityContextOptions {}

export class UserContext extends EntityContext implements UserContextOptions {
  public static readonly FORMAT = EntityContext.FORMAT;

  public constructor(options: UserContextOptions) {
    super(options);
  }

  public build(): string {
    return super.build();
  }
}
