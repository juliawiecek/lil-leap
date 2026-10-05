import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from './auth.service';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Stable quote record for market display and indicative pricing.
 * The execution service has its own durable quote selection logic.
 */
export interface Quote {
  quoteId: string;
  instrumentId: string;
  symbol: string;
  marketCode: string;
  bid: number;
  ask: number;
  midpoint: number;
  quotedAt: string;
  currency: string;
  source: string;
  synthetic: boolean;
}

export interface QuoteError {
  code: string;
  message: string;
}

/**
 * Service for retrieving market quotes via REST API.
 *
 * Provides methods to fetch the latest quote by instrument or by market/symbol,
 * and to retrieve bounded historical quotes. All endpoints require JWT authentication.
 *
 * Requests use relative URLs (/api/v1/quotes/...) so nginx proxies them correctly
 * in Docker Compose and via proxy.conf.json under ng serve.
 */
@Injectable({ providedIn: 'root' })
export class QuoteService {
  private baseUrl = '/api/v1/quotes';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers(): Record<string, string> {
    const token = this.auth.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Retrieves the latest quote for a specific instrument.
   *
   * @param instrumentId persistent instrument identifier
   * @returns latest quote for the instrument
   * @throws 404 if the instrument or quote does not exist
   * @throws 401 if not authenticated
   */
  getLatestByInstrument(instrumentId: string): Observable<Quote> {
    return this.http
      .get<Quote>(`${this.baseUrl}/latest/by-instrument/${instrumentId}`, { headers: this.headers() })
      .pipe(catchError(this.handleError));
  }

  /**
   * Retrieves the latest quote for an enabled, tradable instrument by market and symbol.
   * Parameters are automatically trimmed and uppercased by the server.
   *
   * @param market market identifier (e.g., "NASDAQ")
   * @param symbol instrument trading symbol (e.g., "AAPL")
   * @returns latest quote matching the market and symbol
   * @throws 400 if parameters are invalid
   * @throws 404 if no eligible instrument or quote exists
   * @throws 401 if not authenticated
   */
  getLatestByMarketSymbol(market: string, symbol: string): Observable<Quote> {
    return this.http
      .get<Quote>(`${this.baseUrl}/latest/by-market-symbol`, {
        headers: this.headers(),
        params: { market, symbol }
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Retrieves bounded historical quotes for an instrument, ordered newest first.
   * The server clamps the limit to a safe maximum (1000) to prevent unbounded reads.
   *
   * @param instrumentId persistent instrument identifier
   * @param limit maximum number of quotes to return (default 100, clamped to 1000)
   * @returns list of quotes, ordered by timestamp descending
   * @throws 400 if limit is invalid
   * @throws 404 if no quotes exist for the instrument
   * @throws 401 if not authenticated
   */
  getHistory(instrumentId: string, limit: number = 100): Observable<Quote[]> {
    return this.http
      .get<Quote[]>(`${this.baseUrl}/history/${instrumentId}`, {
        headers: this.headers(),
        params: { limit: limit.toString() }
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Converts string bid/ask/midpoint to numbers for calculations.
   *
   * @param quote quote from API
   * @returns quote with numeric prices
   */
  normalizeQuote(quote: Quote): Quote {
    return {
      ...quote,
      bid: typeof quote.bid === 'string' ? parseFloat(quote.bid) : quote.bid,
      ask: typeof quote.ask === 'string' ? parseFloat(quote.ask) : quote.ask,
      midpoint: typeof quote.midpoint === 'string' ? parseFloat(quote.midpoint) : quote.midpoint
    };
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred while fetching quotes';

    if (error.error && typeof error.error === 'object') {
      const apiError = error.error as QuoteError;
      if (apiError.message) {
        errorMessage = apiError.message;
      }
    }

    return throwError(() => new Error(errorMessage));
  }
}
