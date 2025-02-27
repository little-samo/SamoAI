import { EntityId } from '../entity.types';

export type UserId = EntityId & { __userId: true };
