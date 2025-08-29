import type { Location } from '@little-samo/samo-ai/models';

import type { Entity } from '../../entity';
import type { Gimmick } from '../gimmick';
import type { GimmickInputBuilder } from './gimmick.input';

export class GimmickInputFactory {
  public static readonly INPUT_MAP: Record<
    string,
    new (
      version: number,
      location: Location,
      gimmick: Gimmick,
      entity: Entity,
      parameters: string | Record<string, unknown>
    ) => GimmickInputBuilder
  > = {};

  public static createInput(
    input: string,
    location: Location,
    gimmick: Gimmick,
    entity: Entity,
    parameters: string | Record<string, unknown>
  ): GimmickInputBuilder {
    let version = 0;
    const inputMatch = input.match(/^(\w+):(\w+)$/);
    if (inputMatch) {
      input = inputMatch[1];
      const versionStr = inputMatch[2];
      if (versionStr !== 'latest') {
        version = parseInt(versionStr);
      }
    }

    const InputClass = this.INPUT_MAP[input];
    if (!InputClass) {
      throw new Error(`Unknown gimmick input type: ${input}`);
    }
    return new InputClass(version, location, gimmick, entity, parameters);
  }
}
