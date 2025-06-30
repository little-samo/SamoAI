import { EntityId } from '../entity.types';

export type GimmickId = EntityId & { __gimmickId: true };

export type GimmickParameters = string | Record<string, unknown>;
