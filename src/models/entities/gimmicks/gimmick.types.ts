import { EntityId } from '../entity.types';

export type GimmickId = EntityId & { __gimmickId: true };

export type GimmickParameters =
  | 'NEXT_MESSAGE'
  | string
  | Record<string, unknown>;
