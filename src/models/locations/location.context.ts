import { EntityKey } from '@models/entities/entity';

export interface LocationMessageContext {
  key: EntityKey;
  name: string;
  message?: string;
  expression?: string;
  created: number;
}

export interface LocationContext {
  name: string;
  description: string;

  messages: LocationMessageContext[];
}
