/**
 * Every time Insights shows is US Central time on a 12-hour clock ("2:30 PM CT"), as in the NextTrade
 * trading app, so a trade reads the same in both. Trading days are still New York market days.
 * Angular's DatePipe only takes fixed offsets, which would be an hour off for half the year, so
 * these use Intl.
 */
export const APP_TIME_ZONE = 'America/Chicago';

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: APP_TIME_ZONE });
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: APP_TIME_ZONE });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: APP_TIME_ZONE });
const SECONDS = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: APP_TIME_ZONE,
});

/** Newer ICU puts a narrow no-break space before AM/PM; use a plain space like the rest of the app. */
function plain(text: string): string {
  return text.replace(/ /g, ' ');
}
function at(when: string | Date): Date {
  return typeof when === 'string' ? new Date(when) : when;
}

/** "Oct 16, 2026". */
export function centralDate(when: string | Date): string {
  return DATE.format(at(when));
}
/** "Oct 16". */
export function centralDay(when: string | Date): string {
  return DAY.format(at(when));
}
/** "1:30 PM CT". */
export function centralTime(when: string | Date): string {
  return `${plain(TIME.format(at(when)))} CT`;
}
/** "Oct 16, 1:30 PM CT". */
export function centralDayTime(when: string | Date): string {
  return `${centralDay(when)}, ${centralTime(when)}`;
}
/** "1:29:59 PM CT". */
export function centralClockSeconds(when: string | Date): string {
  return `${plain(SECONDS.format(at(when)))} CT`;
}
/** "Oct 16, 2026, 1:29:59 PM CT". */
export function centralDateTimeSeconds(when: string | Date): string {
  return `${centralDate(when)}, ${plain(SECONDS.format(at(when)))} CT`;
}
/** A 24-hour "HH:00" label on a 12-hour clock: "14:00" is "2 PM", "00:00" is "12 AM". */
export function twelveHour(label: string): string {
  const hour = Number(label.slice(0, 2));
  if (!Number.isFinite(hour)) {
    return label;
  }
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}
