/**
 * Client for the orders service. Calls relative /api/v1/orders path via the gateway.
 * Tokens are supplied by the injected AuthService.
 */

/** Generate a random UUID for client reference */
function generateUUID(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (randomUUID) {
    return randomUUID.call(globalThis.crypto);
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

  let byteIndex = 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = bytes[byteIndex++] >>> 4;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(
    tokens: AccessTokenSource,
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    baseUrl = '/api/v1'
  ) {
    this.#tokens = tokens;
    this.#fetch = fetchImpl;
    this.#baseUrl = baseUrl;
  }

  /**
   * Fetches the authenticated caller's trading accounts.
   * @throws OrderSubmissionError on network failure or server error
   */
  async getAccounts(): Promise<Account[]> {
    const token = this.#tokens.accessToken;
    if (!token) throw new OrderSubmissionError('You must be signed in to submit orders.');

    try {
      const response = await this.#fetch(`${this.#baseUrl}/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new OrderSubmissionError('Could not fetch your accounts. Please try again.');
      return response.json();
    } catch (error) {
      if (error instanceof OrderSubmissionError) throw error;
      throw new OrderSubmissionError('Connection error. Check your network and try again.');
    }
  }

  /**
   * Fetches the instrument catalog.
   * @throws OrderSubmissionError on network failure or server error
   */
  async getInstruments(): Promise<Instrument[]> {
    const token = this.#tokens.accessToken;
    if (!token) throw new OrderSubmissionError('You must be signed in to fetch instruments.');

    try {
      const response = await this.#fetch(`${this.#baseUrl}/instruments`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new OrderSubmissionError('Could not fetch instruments. Please try again.');
      return response.json();
    } catch (error) {
      if (error instanceof OrderSubmissionError) throw error;
      throw new OrderSubmissionError('Connection error. Check your network and try again.');
    }
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
    if (!token) throw new OrderSubmissionError('You must be signed in to submit orders.');
    this.#assertValidSubmitRequest(request);
    const payload = this.#buildSubmitPayload(request);

    try {
      const response = await this.#fetch(`${this.#baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { message?: string; [key: string]: any };

      if (!response.ok) {
        throw this.#toSubmitError(response.status, body.message);
      }

      return body as OrderSubmissionResponse;
    } catch (error) {
      if (error instanceof OrderSubmissionError) throw error;
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
    if (!request.accountId) throw new OrderSubmissionError('Account is required.');
    if (!request.instrumentId) throw new OrderSubmissionError('Instrument is required.');
    if (!request.side || !['BUY', 'SELL'].includes(request.side)) {
      throw new OrderSubmissionError('Side must be BUY or SELL.');
    }
    if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) {
      throw new OrderSubmissionError('Quantity must be a positive whole number.');
    }
    if (!request.clientReference) throw new OrderSubmissionError('Internal error: clientReference is required.');
  }

  #buildSubmitPayload(request: SubmitOrderRequest): SubmitOrderRequest {
    return {
      accountId: request.accountId,
      instrumentId: request.instrumentId,
      side: request.side.toUpperCase() as 'BUY' | 'SELL',
      quantity: request.quantity,
      orderType: request.orderType || 'MARKET',
      clientReference: request.clientReference,
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
