import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface HoldingResponse {
  accountId: string;
  instrumentId: string;
  symbol: string;
  instrumentName: string;
  quantity: number;
  avgCost: number;
  updatedAt: string;
}

export interface CashBalanceDetailResponse {
  accountId: string;
  currency: string;
  settledBalance: number;
  pendingBalance: number;
  availableBalance: number;
  totalBalance: number;
  updatedAt: string;
}

export interface PortfolioSummaryResponse {
  accountId: string;
  holdings: HoldingResponse[];
  cash: CashBalanceDetailResponse;
  totalPortfolioValue: number;
  timestamp: string;
}

/**
 * Holdings API Service
 * Fetches portfolio data from the backend including:
 * - Holdings (symbol, quantity, average cost)
 * - Cash balances (settled, pending, available)
 * - Total portfolio value (calculated from live quotes)
 */
@Injectable({
  providedIn: 'root'
})
export class HoldingsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = '/api/v1';

  /**
   * Get list of holdings for authenticated user (scoped by JWT)
   * No path parameter needed - server uses the JWT principal
   * 
   * @returns Observable<HoldingResponse[]>
   */
  getHoldings(): Observable<HoldingResponse[]> {
    return this.http.get<HoldingResponse[]>(
      `${this.apiUrl}/holdings`,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Get portfolio summary for the authenticated user
   * Gets the user's default account and returns holdings + cash + total value
   * Note: This endpoint requires extracting the clientId from JWT, or we can
   * implement an alternative endpoint on the backend
   * 
   * @returns Observable<PortfolioSummaryResponse>
   */
  getPortfolioSummary(clientId: string): Observable<PortfolioSummaryResponse> {
    return this.http.get<PortfolioSummaryResponse>(
      `${this.apiUrl}/clients/${clientId}/portfolio-summary`,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Helper: Build auth headers with Bearer token
   * Mimics the pattern used by QuoteService
   */
  private getHeaders(): Record<string, string> {
    const token = this.auth.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

