/**
 * Location pause update reason constants
 */
export const LocationPauseReason = {
  NO_AGENTS: 'LOCATION_EMPTY_NO_AGENTS_PRESENT',
  UPDATE_ERROR: 'LOCATION_UPDATE_FAILED_WITH_ERROR',
  SCHEDULED_PAUSE: 'LOCATION_PAUSED_FOR_SCHEDULED_DURATION',
  UPDATE_COMPLETED: 'LOCATION_UPDATE_CYCLE_COMPLETED',
} as const;

export type LocationPauseReason =
  (typeof LocationPauseReason)[keyof typeof LocationPauseReason];
