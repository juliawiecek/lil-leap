import { InjectionToken } from '@angular/core';

export interface ReportSummary {
  accounts: number;
  orders: number;
  fills: number;
  gross_executed_value: number | string;
}
export interface LiveReports {
  load(): Promise<ReportSummary>;
  logout(): Promise<void>;
}
export const LIVE_REPORTS = new InjectionToken<LiveReports>('Live reporting API');
