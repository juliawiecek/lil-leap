import { Component, computed, input } from '@angular/core';

const STATUSES: Record<string, { label: string; icon: string }> = {
  FILLED: { label: 'Filled', icon: '✓' }, REJECTED: { label: 'Rejected', icon: '!' },
  CANCELLED: { label: 'Cancelled', icon: '×' }, PENDING: { label: 'Pending', icon: '◷' },
  SUBMITTED: { label: 'Submitted', icon: '◷' }, ACCEPTED: { label: 'Accepted', icon: '◷' },
  DELAYED: { label: 'Delayed', icon: '!' }, SETTLED: { label: 'Settled', icon: '✓' },
  COMPLETED: { label: 'Completed', icon: '✓' }, OPEN: { label: 'Open', icon: '✓' },
  CLOSED: { label: 'Closed', icon: '×' }, INFO: { label: 'Information', icon: 'i' },
};
export function statusPresentation(value: string | null | undefined) {
  const key = value?.toUpperCase() ?? '';
  return STATUSES[key] ?? { label: key ? key.charAt(0) + key.slice(1).toLowerCase().replaceAll('_', ' ') : 'Unknown', icon: '—' };
}

@Component({
  selector: 'app-status-badge',
  template: `<span class="status-symbol" aria-hidden="true">{{ status().icon }}</span> {{ status().label }}`,
  styles: [`.status-symbol { display: inline-block; min-width: 1em; text-align: center; font-weight: 700; } :host { white-space: nowrap; }`],
})
export class StatusBadge {
  readonly value = input<string | null | undefined>();
  readonly status = computed(() => statusPresentation(this.value()));
}
