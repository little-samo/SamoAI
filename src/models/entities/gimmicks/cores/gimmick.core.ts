import { z } from 'zod';

import { type LocationEntityCanvasMeta } from '../../../locations/location.meta';
import { type GimmickCoreMeta, type GimmickCoreOptions } from '../gimmick.meta';
import { type GimmickParameters } from '../gimmick.types';

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
    return this.meta.canvas;
  }
  public get options(): GimmickCoreOptions {
    return this.meta.options ?? {};
  }

  public abstract update(): Promise<boolean>;

  public abstract execute(
    entity: Entity,
    parameters: GimmickParameters
  ): Promise<string | undefined>;
}
