import { AgentId, EntityId, EntityType, UserId } from '@little-samo/samo-ai';

import { LocationId } from '../location.types';

export interface LocationCanvas {
  lastModifierEntityType: EntityType;
  lastModifierEntityId: EntityId;

  text: string;

  updatedAt: Date;
  createdAt: Date;
}

export interface LocationObjective {
  description: string;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
}

export interface LocationMission {
  mainMission: string;
  objectives: LocationObjective[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LocationState {
  locationId: LocationId;

  agentIds: AgentId[];
  userIds: UserId[];

  pauseUpdateUntil: Date | null;
  pauseUpdateReason: string | null;
  pauseUpdateNextAgentId: AgentId | null;

  remainingAgentExecutions: number | null;

  canvases: Record<string, LocationCanvas>;

  mission: LocationMission | null;

  images: string[];
  rendering: string | null;

  updatedAt: Date;
  createdAt: Date;
}
