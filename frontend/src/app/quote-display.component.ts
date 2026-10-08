import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { interval, Subject, takeUntil, switchMap, startWith, tap, catchError, Observable } from 'rxjs';
import { of } from 'rxjs';
import { QuoteService, Quote } from './quote.service';
import { FormatAgePipe } from './format-age.pipe';

/**
 * Displays the latest market quote with polling for updates.
 *
 * Shows bid, ask, midpoint, and a timestamp with last-updated age.
 * Implements automatic polling with configurable interval and proper cleanup on destroy.
 *
 * This component is for indicative pricing only -- the execution service uses
 * its own durable quote selection logic independent of displayed quotes.
 *
 * Usage:
 * ```html
 * <app-quote-display
 *   [instrumentId]="selectedInstrumentId"
 *   [pollingIntervalMs]="5000"
 * ></app-quote-display>
 * ```
 */
@Component({
  selector: 'app-quote-display',
  standalone: true,
  imports: [CommonModule, FormatAgePipe],
  template: `
    <div class="quote-display" [class.loading]="isLoading" [class.error]="hasError">
      <div class="quote-header">
        <h3>Indicative Price</h3>
        <span class="symbol" *ngIf="quote">{{ quote.symbol }}</span>
      </div>

      <div *ngIf="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>Fetching quote...</p>
      </div>

      <div *ngIf="hasError && !isLoading" class="error-state">
        <p class="error-message">{{ errorMessage }}</p>
        <button (click)="retryFetch()" class="retry-button">Retry</button>
      </div>

      <div *ngIf="quote && !isLoading && !hasError" class="quote-content">
        <div class="price-row">
          <div class="price-item">
            <label>Bid</label>
            <span class="price">{{ quote.bid | number: '1.2-8' }}</span>
          </div>
          <div class="price-item">
            <label>Ask</label>
            <span class="price">{{ quote.ask | number: '1.2-8' }}</span>
          </div>
          <div class="price-item">
            <label>Midpoint</label>
            <span class="price main">{{ quote.midpoint | number: '1.2-8' }}</span>
          </div>
        </div>

        <div class="quote-metadata">
          <div class="timestamp">
            <label>Last Updated</label>
            <span>{{ lastUpdateAgeMs | async | formatAge }}</span>
          </div>
          <div class="quote-time">
            <span class="time-label">Quoted at</span>
            <span>{{ quote.quotedAt | date: 'short' }}</span>
          </div>
          <div class="quote-source" *ngIf="quote.synthetic">
            <span class="badge synthetic">SYNTHETIC</span>
          </div>
        </div>
      </div>

      <div *ngIf="!quote && !isLoading && !hasError" class="empty-state">
        <p>No quote data available</p>
      </div>
    </div>
  `,
  styles: [`
    .quote-display {
      padding: 1rem;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background-color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }

    .quote-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 0.5rem;
    }

    .quote-header h3 {
      margin: 0;
      font-size: 1.25rem;
      color: #333;
    }

    .symbol {
      font-weight: bold;
      font-size: 1.1rem;
      color: #0066cc;
    }

    .loading-state,
    .error-state,
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
      color: #666;
    }

    .spinner {
      width: 30px;
      height: 30px;
      border: 3px solid #e0e0e0;
      border-top: 3px solid #0066cc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-message {
      color: #d32f2f;
      margin: 0.5rem 0;
      text-align: center;
    }

    .retry-button {
      margin-top: 1rem;
      padding: 0.5rem 1.5rem;
      background-color: #0066cc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.95rem;
    }

    .retry-button:hover {
      background-color: #0052a3;
    }

    .quote-content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .price-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
    }

    .price-item {
      display: flex;
      flex-direction: column;
      padding: 0.75rem;
      background-color: white;
      border-radius: 4px;
      border-left: 3px solid #0066cc;
    }

    .price-item label {
      font-size: 0.85rem;
      color: #666;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .price {
      font-size: 1.25rem;
      font-weight: bold;
      color: #333;
      font-family: 'Courier New', monospace;
    }

    .price.main {
      font-size: 1.5rem;
      color: #0066cc;
    }

    .quote-metadata {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      padding: 1rem;
      background-color: white;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
      font-size: 0.9rem;
    }

    .timestamp,
    .quote-time,
    .quote-source {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .timestamp label,
    .time-label {
      font-weight: 600;
      color: #666;
      font-size: 0.8rem;
    }

    .quote-metadata span:not(.badge):not(.time-label) {
      color: #333;
      font-family: 'Courier New', monospace;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      width: fit-content;
    }

    .badge.synthetic {
      background-color: #fff3cd;
      color: #856404;
      border: 1px solid #ffc107;
    }

    .quote-display.loading {
      opacity: 0.7;
    }

    .quote-display.error {
      border-color: #d32f2f;
    }
  `]
})
export class QuoteDisplayComponent implements OnInit, OnDestroy {
  /** Instrument ID to fetch quotes for */
  @Input() instrumentId: string = '';

  /** Polling interval in milliseconds (default 5000ms = 5 seconds) */
  @Input() pollingIntervalMs: number = 5000;

  quote: Quote | null = null;
  isLoading = false;
  hasError = false;
  errorMessage = '';
  lastUpdateAgeMs: Observable<number> = of(0);

  private readonly destroy$ = new Subject<void>();
  private lastUpdateTime = 0;

  constructor(private readonly quoteService: QuoteService) {}

  ngOnInit(): void {
    if (!this.instrumentId) {
      this.errorMessage = 'Instrument ID is required';
      this.hasError = true;
      return;
    }

    // Start polling at the specified interval
    interval(this.pollingIntervalMs)
      .pipe(
        startWith(0),  // Fetch immediately on init
        switchMap(() => this.fetchQuote()),
        takeUntil(this.destroy$)
      )
      .subscribe();

    // Update the age display every second
    interval(1000)
      .pipe(
        startWith(0),
        tap(() => {
          if (this.lastUpdateTime > 0) {
            this.lastUpdateAgeMs = of(Date.now() - this.lastUpdateTime);
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  retryFetch(): void {
    this.hasError = false;
    this.errorMessage = '';
    this.fetchQuote().subscribe();
  }

  private fetchQuote() {
    this.isLoading = true;
    return this.quoteService.getLatestByInstrument(this.instrumentId)
      .pipe(
        tap(quote => {
          this.quote = this.quoteService.normalizeQuote(quote);
          this.lastUpdateTime = Date.now();
          this.isLoading = false;
          this.hasError = false;
          this.errorMessage = '';
        }),
        catchError(error => {
          this.isLoading = false;
          this.hasError = true;
          this.errorMessage = error.message || 'Failed to fetch quote';
          return of(null);
        })
      );
  }
}
