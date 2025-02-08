import { EntityKey } from '@models/entities/entity';

export interface LocationMessageContext {
  key: EntityKey;
  name: string;
  message?: string;
  expression?: string;
}

export interface LocationContext {
  name: string;
  description: string;

  messages: LocationMessageContext[];
}
