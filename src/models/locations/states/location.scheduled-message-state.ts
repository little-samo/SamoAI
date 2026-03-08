import {
  EntityId,
  EntityType,
  DayOfWeek,
  LocationId,
} from '@little-samo/samo-ai';

export interface LocationScheduledMessageState {
  id?: string | number | bigint;
  locationId: LocationId;
  entityType: EntityType;
  entityId: EntityId;
  message: string;
  nextMessageAt: Date | null;
  repeatTimesOfDay: string[];
  repeatDaysOfWeek: DayOfWeek[];
  repeatUntil: Date | null;
  maxRepeatCount: number | null;
  sentCount: number;
  isActive: boolean;
  updatedAt: Date;
  createdAt: Date;
}
