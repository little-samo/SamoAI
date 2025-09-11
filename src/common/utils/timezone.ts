/**
 * Represents a validated timezone that has been verified to be valid
 */
export type ValidatedTimezone = string & { readonly __brand: unique symbol };

/**
 * Creates a validated timezone after checking if it's valid
 * @param timezone The timezone string to validate (e.g., 'Asia/Seoul', 'UTC', 'America/New_York')
 * @returns ValidatedTimezone if valid, null if invalid
 */
export function createValidatedTimezone(
  timezone: string
): ValidatedTimezone | null {
  if (!timezone || typeof timezone !== 'string') {
    return null;
  }

  try {
    // Use Intl.DateTimeFormat to check if timezone is valid
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone as ValidatedTimezone;
  } catch {
    return null;
  }
}

/**
 * Validates if a timezone string is valid (legacy function, use createValidatedTimezone instead)
 * @param timezone The timezone string to validate
 * @returns true if the timezone is valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  return createValidatedTimezone(timezone) !== null;
}

/**
 * Gets the timezone offset string for a given timezone and date
 * @param date The date to get offset for
 * @param timezone The timezone
 * @returns Offset string in format +HH:MM or -HH:MM
 */
function getTimezoneOffsetString(
  date: Date,
  timezone: ValidatedTimezone
): string {
  try {
    // Use the more direct approach: compare UTC with local time
    const utcTime = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const localTime = new Date(
      date.toLocaleString('en-US', { timeZone: timezone })
    );

    // Calculate offset in minutes
    const offsetMinutes = Math.round(
      (localTime.getTime() - utcTime.getTime()) / 60000
    );

    // Handle special case: if offset is 0, return 'Z' for UTC
    if (offsetMinutes === 0) {
      return 'Z';
    }

    // Convert to hours and minutes
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;

    // Format as +HH:MM or -HH:MM
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const hours = offsetHours.toString().padStart(2, '0');
    const mins = offsetMins.toString().padStart(2, '0');

    return `${sign}${hours}:${mins}`;
  } catch {
    return 'Z'; // Fallback to UTC
  }
}

/**
 * Formats a Date to ISO string with validated timezone applied and proper offset
 * Uses the standard toLocaleString method for better performance and simplicity
 * @param date The date to format
 * @param timezone The validated timezone to apply
 * @returns ISO 8601 string with timezone offset (e.g., 2025-01-01T21:00:00.000+09:00)
 */
export function formatDateWithValidatedTimezone(
  date: Date,
  timezone?: ValidatedTimezone
): string {
  if (!timezone) {
    return date.toISOString();
  }

  try {
    // Use toLocaleString with sv-SE locale for ISO-like format
    const localString = date.toLocaleString('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });

    // Get the timezone offset
    const offsetString = getTimezoneOffsetString(date, timezone);

    // Convert to ISO format and ensure proper decimal separator
    // YYYY-MM-DD HH:mm:ss,SSS -> YYYY-MM-DDTHH:mm:ss.SSS+HH:MM
    return localString.replace(' ', 'T').replace(',', '.') + offsetString;
  } catch {
    return date.toISOString();
  }
}

/**
 * Formats a Date to ISO string with timezone applied (fallback for optional timezone)
 * @param date The date to format
 * @param timezone The timezone to apply (optional, can be string or ValidatedTimezone)
 * @returns ISO string with timezone applied, or original ISO string if timezone is invalid/missing
 */
export function formatDateWithTimezone(
  date: Date,
  timezone?: string | ValidatedTimezone
): string {
  if (!timezone) {
    return date.toISOString();
  }

  // Try to validate the timezone and format with it
  const validatedTimezone = createValidatedTimezone(timezone as string);
  if (!validatedTimezone) {
    return date.toISOString();
  }

  return formatDateWithValidatedTimezone(date, validatedTimezone);
}
