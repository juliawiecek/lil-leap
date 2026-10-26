import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
/**
 * Client for the orders service. Calls relative /api/v1/orders path via the gateway.
 * Tokens are supplied by the injected AuthService.
 */

/** Generate a random UUID for client reference */
function generateUUID(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) {
    return randomUUID();
  }
  const getRandomValues = globalThis.crypto?.getRandomValues;
  if (!getRandomValues) {
    throw new Error('Secure random generator is unavailable for UUID creation.');
  }

  // Fallback: generate UUID v4 bytes from secure crypto source.
  const bytes = new Uint8Array(16);
  getRandomValues.call(globalThis.crypto, bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Parsed instrument from the catalog. */
export interface Instrument {
  instrumentId: string;
  symbol: string;
  instrumentName: string;
  assetClass: string;
  marketCode: string;
  currency: string;
  sector: string;
  enabled: boolean;
  tradable: boolean;
}

/** Parsed account from the caller's portfolio. */
export interface Account {
  account_id: string;
  account_number: string;
  account_name: string;
  account_status: string;
  trader_level: string;
  trading_enabled: boolean;
}

/** Request payload for order submission. */
export interface SubmitOrderRequest {
  accountId: string;
  instrumentId: string;
  symbol?: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  orderType?: string;
  clientReference: string;
  bufferPercent?: number;
  limitPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
}

/** Response from successful order submission. */
export interface OrderSubmissionResponse {
  orderId: string;
  accountId: string;
  instrumentId: string;
  symbol: string;
  clientReference: string;
  side: string;
  quantity: number;
  orderType: string;
  status: string;
  submittedAt: string;
  bufferPercent?: number;
  limitPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
}

/** Anything that can supply the current access token. */
export interface AccessTokenSource {
  readonly accessToken: string | null;
}

/**
 * Controlled error for order submission failures with a user-safe message.
 */
export class OrderSubmissionError extends Error {
  readonly userMessage: string;
  readonly httpStatus?: number;

  constructor(userMessage: string, httpStatus?: number) {
    super(userMessage);
    this.name = 'OrderSubmissionError';
    this.userMessage = userMessage;
    this.httpStatus = httpStatus;
  }
}

/**
 * Client for order submission and account/instrument lookups.
 */
export class OrderSubmissionClient {
  readonly #tokens: AccessTokenSource;
  readonly #http: ApiHttpClient;
  readonly #baseUrl: string;

  constructor(
    tokens: AccessTokenSource,
    http: ApiHttpClient,
    baseUrl = '/api/v1'
  ) {
    this.#tokens = tokens;
    this.#http = http;
    this.#baseUrl = baseUrl;
  }

  /**
   * Fetches the authenticated caller's trading accounts.
   * @throws OrderSubmissionError on network failure or server error
   */
  async getAccounts(): Promise<Account[]> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new OrderSubmissionError('You must be signed in to submit orders.');
    }

    try {
      return await firstValueFrom(this.#http.get<Account[]>(`${this.#baseUrl}/accounts`));
    } catch (error) {
      throw this.#lookupError(error, 'Could not fetch your accounts. Please try again.');
    }
  }

  /** Fetches the instrument catalog. */
  async getInstruments(): Promise<Instrument[]> {
    if (!this.#tokens.accessToken) {
      throw new OrderSubmissionError('You must be signed in to fetch instruments.');
    }
    try {
      return await firstValueFrom(this.#http.get<Instrument[]>(`${this.#baseUrl}/instruments`));
    } catch (error) {
      throw this.#lookupError(error, 'Could not fetch instruments. Please try again.');
    }
  }

  #lookupError(error: unknown, message: string): OrderSubmissionError {
    if (error instanceof HttpErrorResponse && error.status !== 0) {
      return new OrderSubmissionError(message, error.status);
    }
    return new OrderSubmissionError('Connection error. Check your network and try again.');
  }

  /**
   * Submits a market order on behalf of the authenticated caller.
   * Idempotency: Reusing the same clientReference for a request retries the same order.
   *
   * @param request submission payload with accountId, instrumentId, side, quantity, clientReference
   * @return order submission response with orderId and status
   * @throws OrderSubmissionError on validation failure, network error, or insufficient funds
   */
  async submit(request: SubmitOrderRequest): Promise<OrderSubmissionResponse> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new OrderSubmissionError('You must be signed in to submit orders.');
    }
    this.#assertValidSubmitRequest(request);
    const payload = this.#buildSubmitPayload(request);

    try {
      return await firstValueFrom(this.#http.post<OrderSubmissionResponse>(`${this.#baseUrl}/orders`, payload));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status !== 0) {
        const message = typeof error.error?.message === 'string' ? error.error.message : undefined;
        throw this.#toSubmitError(error.status, message);
      }
      throw new OrderSubmissionError('Connection error. Check your network and try again.');
    }
  }

  /**
   * Generates a new UUID for idempotent order submission retries.
   * @return UUID v4 as a string
   */
  static generateClientReference(): string {
    return generateUUID();
  }

  #assertValidSubmitRequest(request: SubmitOrderRequest): void {
    if (!request.accountId) {
      throw new OrderSubmissionError('Account is required.');
    }
    if (!request.instrumentId) {
      throw new OrderSubmissionError('Instrument is required.');
    }
    if (!request.side || !['BUY', 'SELL'].includes(request.side)) {
      throw new OrderSubmissionError('Side must be BUY or SELL.');
    }
    if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) {
      throw new OrderSubmissionError('Quantity must be a positive whole number.');
    }
    if (!request.clientReference) {
      throw new OrderSubmissionError('Internal error: clientReference is required.');
    }
  }

  #buildSubmitPayload(request: SubmitOrderRequest): SubmitOrderRequest {
    return {
      accountId: request.accountId,
      instrumentId: request.instrumentId,
      side: request.side.toUpperCase() as 'BUY' | 'SELL',
      quantity: request.quantity,
      orderType: request.orderType || 'MARKET',
      clientReference: request.clientReference,
      ...(request.limitPrice !== undefined && { limitPrice: request.limitPrice }),
      ...(request.takeProfitPrice !== undefined && { takeProfitPrice: request.takeProfitPrice }),
      ...(request.stopLossPrice !== undefined && { stopLossPrice: request.stopLossPrice }),
      ...(request.bufferPercent !== undefined && request.bufferPercent !== null && { bufferPercent: request.bufferPercent }),
    };
  }

  #toSubmitError(status: number, message?: string): OrderSubmissionError {
    const statusMessages: Record<number, string> = {
      400: 'Invalid order details. Please review and try again.',
      403: 'You do not have permission to submit orders.',
      409: 'This order already exists. Check your history.',
    };
    return new OrderSubmissionError(message || statusMessages[status] || `Server error (${status}). Please try again.`, status);
  }
}
