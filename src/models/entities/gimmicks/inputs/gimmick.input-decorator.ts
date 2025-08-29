import { type Location } from '@little-samo/samo-ai/models';

import { type Entity } from '../../entity';
import { Gimmick } from '../gimmick';

import { GimmickInputBuilder } from './gimmick.input';
import { GimmickInputFactory } from './gimmick.input-factory';

export const GIMMICK_INPUT_METADATA_KEY = 'gimmick:input';

export function RegisterGimmickInput(input: string): ClassDecorator {
  return function (target: object) {
    Reflect.defineMetadata(GIMMICK_INPUT_METADATA_KEY, input, target);
    GimmickInputFactory.INPUT_MAP[input] = target as new (
      version: number,
      location: Location,
      gimmick: Gimmick,
      entity: Entity,
      parameters: string | Record<string, unknown>
    ) => GimmickInputBuilder;
  };
}
