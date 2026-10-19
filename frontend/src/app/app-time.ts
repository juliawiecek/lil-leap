/**
 * Every time the app shows is US Central time on a 12-hour clock ("2:30 PM CT"), whatever the
 * viewer's own time zone, so times read the same for everyone.
 */
export const APP_TIME_ZONE = 'America/Chicago';

/** Formats an instant in Central time with a 12-hour clock. */
export function centralTime(at: number | Date, options: Intl.DateTimeFormatOptions, locale = 'en-US'): string {
  const usesClock = options.hour !== undefined;
  return new Intl.DateTimeFormat(locale, { ...options, ...(usesClock ? { hour12: true } : {}), timeZone: APP_TIME_ZONE }).format(at);
}

/** The Central-time calendar day of an instant, e.g. "2026-10-19", for same-day checks. */
export function centralDay(at: number | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
