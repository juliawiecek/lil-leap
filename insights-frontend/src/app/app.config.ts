import { ApiHttpClient, SESSION_AUTH } from '@lilleap/session-core/angular';
import { AuthService } from './auth.service';
import { DestroyRef, inject, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  LIVE_REPORTS, REPORT_FILES, attachmentFilename,
  type ActivityPoint, type LiveReports, type OrdersToday, type ReportFiles, type ReportSummary, type TopInstrument,
} from './live-reports';
import {
  CLIENT_ACCOUNTS, queryParams,
  type ClientAccounts, type ClientDetail, type ClientOrder, type ClientSummary, type Page,
} from './client-accounts';
import { TRADE_RECORDS, type TradeRecord, type TradeRecords } from './trade-records';
import { routes } from './app.routes';
import { SiteAccessibility } from './site-accessibility';
import { AppSessionService } from './app-session.service';
import { authInterceptor } from './auth-routing';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

import { BrowserScanStore, SWITCH_SCAN_STORE } from '../../../shared/switch-scan-options';
import { SwitchScanService } from '../../../shared/switch-scan';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: SWITCH_SCAN_STORE, useFactory: () => new BrowserScanStore('nexttrade-insights.accessibility') },
    provideAppInitializer(() => { const stop = inject(SwitchScanService).listenForShortcut(); inject(DestroyRef).onDestroy(stop); }),
    { provide: LIVE_REPORTS, useFactory: (): LiveReports => {
      const http = inject(ApiHttpClient);
      return {
        load: () => firstValueFrom(http.get<ReportSummary>('/api/v1/reports/summary')),
        topInstruments: () => firstValueFrom(http.get<TopInstrument[]>('/api/v1/reports/insights/top-instruments')),
        activityTrend: () => firstValueFrom(http.get<ActivityPoint[]>('/api/v1/reports/insights/client-activity-trend')),
        ordersToday: () => firstValueFrom(http.get<OrdersToday>('/api/v1/reports/orders-today')),
      };
    } },
    { provide: CLIENT_ACCOUNTS, useFactory: (): ClientAccounts => {
      const http = inject(ApiHttpClient);
      const clients = '/api/v1/reports/clients';
      return {
        list: (filters) => firstValueFrom(http.get<Page<ClientSummary>>(clients, { params: queryParams({ ...filters }) })),
        detail: (id) => firstValueFrom(http.get<ClientDetail>(`${clients}/${encodeURIComponent(id)}`)),
        orders: (id, filters) => firstValueFrom(
          http.get<Page<ClientOrder>>(`${clients}/${encodeURIComponent(id)}/orders`, { params: queryParams({ ...filters }) })),
      };
    } },
    { provide: TRADE_RECORDS, useFactory: (): TradeRecords => {
      const http = inject(ApiHttpClient);
      return {
        load: (orderId) => firstValueFrom(http.get<TradeRecord>(`/api/v1/trades/${encodeURIComponent(orderId)}`)),
      };
    } },
    { provide: REPORT_FILES, useFactory: (): ReportFiles => {
      // Report CSVs are text, which ApiHttpClient's JSON-typed get cannot return; the auth
      // interceptor below still attaches the session token to this same-origin /api request.
      const http = inject(HttpClient);
      return {
        generate: async (kind, range) => {
          const response = await firstValueFrom(http.get(`/api/v1/reports/generate/${kind}`, {
            params: { startDate: range.startDate, endDate: range.endDate },
            responseType: 'text',
            observe: 'response',
          }));
          return {
            filename: attachmentFilename(response.headers.get('Content-Disposition'),
              `${kind}_${range.startDate}_${range.endDate}.csv`),
            csv: response.body ?? '',
          };
        },
      };
    } },
    { provide: SESSION_AUTH, useExisting: AuthService },
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(AppSessionService).initialize()),
    provideAppInitializer(() => inject(SiteAccessibility).start()),
    provideBrowserGlobalErrorListeners(),
  ],
};
