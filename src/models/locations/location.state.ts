import { EntityState } from '../entities/entity.state.js';

export interface LocationState {
  entities: { [id: number]: EntityState };
}
