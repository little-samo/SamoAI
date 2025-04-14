import { z } from 'zod';

import { type LocationEntityCanvasMeta } from '../../../locations/location.meta';
import { GimmickCoreMeta } from '../gimmick.meta';
import { GimmickParameters } from '../gimmick.types';

import type { Entity } from '../../entity';
import type { Gimmick } from '../gimmick';

export abstract class GimmickCore {
  protected constructor(
    public readonly gimmick: Gimmick,
    public readonly meta: GimmickCoreMeta
  ) {}

  public get name(): string {
    return this.meta.name;
  }

  public abstract get description(): string;
  public abstract get parameters(): z.ZodSchema;
  public get canvas(): LocationEntityCanvasMeta | undefined {
    return undefined;
  }

  public abstract update(): Promise<boolean>;

  public abstract execute(
    entity: Entity,
    parameters: GimmickParameters
  ): Promise<boolean>;
}
