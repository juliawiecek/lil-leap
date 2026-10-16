import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats milliseconds elapsed since an event into a human-readable age string.
 *
 * Examples:
 * - 500ms -> "just now"
 * - 5000ms -> "5 seconds ago"
 * - 125000ms -> "2 minutes ago"
 * - 7200000ms -> "2 hours ago"
 */
@Pipe({
  name: 'formatAge',
  standalone: true
})
export class FormatAgePipe implements PipeTransform {
  transform(milliseconds: number | null): string {
    if (!milliseconds || milliseconds < 0) {
      return 'unknown';
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 1) {
      return 'just now';
    }
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    }
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
    if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
}
