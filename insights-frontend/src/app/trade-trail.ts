import { InjectionToken } from '@angular/core';

/** One recorded step of a trade, as the insights service returns it (TS-16.1b). */
export interface TradeEvent {
  /** STATUS, AUDIT, FILL, CASH or HOLDING: which permanent record it came from. */
  source: string;
  type: string;
  actor: string | null;
  occurredAt: string;
  details: Record<string, unknown> | null;
}
export interface TradeTrailResponse {
  orderId: string;
  /** False when no audit rows exist yet, so the trail is marked incomplete. */
  auditRecorded: boolean;
  events: TradeEvent[];
}
export interface TradeTrail {
  load(orderId: string): Promise<TradeTrailResponse>;
}
export const TRADE_TRAIL = new InjectionToken<TradeTrail>('Trade trail API');
