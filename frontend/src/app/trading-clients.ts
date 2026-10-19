import type { ApiHttpClient } from '@lilleap/session-core/angular';
import { OrderHistoryClient, type AccessTokenSource } from './order-history-api';
import { OrderSubmissionClient } from './order-submission-api';
import { PortfolioClient } from './portfolio-api';
import { OrderStatusClient } from './order-feedback';
import { CashActivityClient } from './activity-api';

/** The API clients both trading dashboards use. */
export interface TradingClients {
  readonly orderSubmissionClient: OrderSubmissionClient;
  readonly orderHistoryClient: OrderHistoryClient;
  readonly portfolioClient: PortfolioClient;
  readonly orderStatusClient: OrderStatusClient;
  readonly cashActivityClient: CashActivityClient;
}

/**
 * Builds every dashboard client on the shared transport, so the interceptor attaches the bearer
 * token and ends the session on a 401 (NEXT-163).
 */
export function tradingClients(tokens: AccessTokenSource, http: ApiHttpClient): TradingClients {
  return {
    orderSubmissionClient: new OrderSubmissionClient(tokens, http),
    orderHistoryClient: new OrderHistoryClient(tokens, http),
    portfolioClient: new PortfolioClient(tokens, http),
    orderStatusClient: new OrderStatusClient(tokens, http),
    cashActivityClient: new CashActivityClient(tokens, http),
  };
}
