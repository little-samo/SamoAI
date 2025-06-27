/**
 * Location pause update reason constants
 */
const locationPauseReasonValues = [
  'NO_AGENTS',
  'UPDATE_ERROR',
  'SCHEDULED_PAUSE',
  'UPDATE_COMPLETED',
] as const;

export const LocationPauseReason = Object.fromEntries(
  locationPauseReasonValues.map((value) => [value, value])
) as Record<
  (typeof locationPauseReasonValues)[number],
  (typeof locationPauseReasonValues)[number]
>;

export type LocationPauseReason = (typeof locationPauseReasonValues)[number];
