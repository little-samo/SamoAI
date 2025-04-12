import { GimmickCoreMeta } from '../gimmick.meta';

import type { Gimmick } from '../gimmick';

export abstract class GimmickCore {
  protected constructor(
    public readonly gimmick: Gimmick,
    public readonly meta: GimmickCoreMeta
  ) {}

  public get name(): string {
    return this.meta.name;
  }

  public abstract update(): Promise<boolean>;
}
