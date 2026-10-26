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

/** The hour of the day (0-23) in Central time, for greetings and other time-of-day decisions. */
export function centralHour(at: number | Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: APP_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(at));
}

/** A full timestamp the way every list shows it: "Oct 16, 2026, 2:05 PM CT". Empty for an unreadable date. */
export function centralTimestamp(at: number | Date | string, seconds = false): string {
  const date = typeof at === 'string' ? new Date(at) : at;
  const time = typeof date === 'number' ? date : date.getTime();
  if (!Number.isFinite(time)) {
    return '';
  }
  return `${centralTime(time, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) })} CT`;
}

/** A clock time in Central time: "2:05 PM CT". */
export function centralClock(at: number | Date, seconds = false): string {
  return `${centralTime(at, { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) })} CT`;
}

/** The Central-time calendar day of an instant, e.g. "2026-10-19", for same-day checks. */
export function centralDay(at: number | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
