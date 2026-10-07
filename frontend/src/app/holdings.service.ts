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

export interface PortfolioSummaryResponse {
  accountId: string;
  holdings: HoldingResponse[];
  cash: {
    accountId: string;
    currency: string;
    settledBalance: number;
    pendingBalance: number;
    availableBalance: number;
    totalBalance: number;
    updatedAt: string;
  };
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
  private readonly apiUrl = '/api/v1/clients';

  /**
   * Get portfolio summary for the authenticated user
   * Returns holdings, cash balance, and total portfolio value
   * calculated from CURRENT market prices
   * 
   * @param clientId - user ID (typically from auth context)
   * @returns Observable<PortfolioSummaryResponse>
   */
  getPortfolioSummary(clientId: string): Observable<PortfolioSummaryResponse> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.auth.getToken()}`
    });
    
    return this.http.get<PortfolioSummaryResponse>(
      `${this.apiUrl}/${clientId}/portfolio-summary`,
      { headers }
    );
  }

  /**
   * Get list of holdings for authenticated user
   * @param clientId - user ID
   * @returns Observable<HoldingResponse[]>
   */
  getHoldings(clientId: string): Observable<HoldingResponse[]> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.auth.getToken()}`
    });
    
    return this.http.get<HoldingResponse[]>(
      `${this.apiUrl}/${clientId}/holdings`,
      { headers }
    );
  }
}
