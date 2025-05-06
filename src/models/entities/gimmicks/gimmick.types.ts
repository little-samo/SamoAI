import { EntityId } from '../entity.types';

export type GimmickId = EntityId & { __gimmickId: true };

export type GimmickParameters =
  | 'PREV_MESSAGE'
  | string
  | Record<string, unknown>;
