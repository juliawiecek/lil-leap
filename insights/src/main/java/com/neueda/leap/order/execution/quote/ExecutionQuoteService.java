package com.neueda.leap.order.execution.quote;
import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;
/** Retrieves the latest quote during execution and makes a deterministic freshness decision. */
public class ExecutionQuoteService {
 private final ExecutionOrderContextRepository orders; private final QuoteRepository quotes;
 private final QuoteFreshnessPolicy freshness; private final Clock clock; private final long maximumQuoteAttempts;
 public ExecutionQuoteService(ExecutionOrderContextRepository orders,QuoteRepository quotes,QuoteFreshnessPolicy freshness,Clock clock,long maximumQuoteAttempts){
  if(maximumQuoteAttempts<1) throw new IllegalArgumentException("Maximum quote attempts must be positive");
  this.orders=orders;this.quotes=quotes;this.freshness=freshness;this.clock=clock;this.maximumQuoteAttempts=maximumQuoteAttempts;
 }
 public ExecutionQuoteDecision selectForExecution(UUID orderId){
  var order=orders.findForExecution(orderId).orElseThrow(()->new IllegalArgumentException("Order is not eligible for execution"));
  var now=OffsetDateTime.now(clock); MarketQuote quote=quotes.findLatestByInstrumentId(order.instrumentId()).orElse(null);
  if(quote==null) return retryOrReject(order.executionAttempt(),ExecutionQuoteDecision.Reason.QUOTE_UNAVAILABLE,null,now);
  return switch(freshness.evaluate(quote.quotedAt(),now)){
   case FRESH -> new ExecutionQuoteDecision(ExecutionQuoteDecision.Action.CONTINUE,ExecutionQuoteDecision.Reason.QUOTE_FRESH,quote,now);
   case STALE -> retryOrReject(order.executionAttempt(),ExecutionQuoteDecision.Reason.STALE_QUOTE,quote,now);
   case INVALID_FUTURE_TIMESTAMP -> retryOrReject(order.executionAttempt(),ExecutionQuoteDecision.Reason.INVALID_QUOTE_TIMESTAMP,quote,now);
  };
 }
 private ExecutionQuoteDecision retryOrReject(long attempt,ExecutionQuoteDecision.Reason reason,MarketQuote quote,OffsetDateTime now){
  var action=attempt>=maximumQuoteAttempts?ExecutionQuoteDecision.Action.REJECT:ExecutionQuoteDecision.Action.REQUEUE;
  return new ExecutionQuoteDecision(action,reason,quote,now);
 }
}
