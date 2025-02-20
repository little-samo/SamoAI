import {
  AgentId,
  UserId,
} from '@little-samo/samo-ai/models/entities/entity.types';

import { LocationId } from '../location';

export interface LocationMessage {
  agentId?: AgentId;
  userId?: UserId;
  targetEntityKey?: string;

  name: string;
  expression?: string;
  message?: string;

  updatedAt: Date;
  createdAt: Date;
}

export interface LocationMessagesState {
  locationId: LocationId;
  messages: LocationMessage[];

  updatedAt: Date;
  createdAt: Date;

  dirty?: boolean;
}
