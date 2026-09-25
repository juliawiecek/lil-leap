package com.neueda.leap.order.execution.quote;
import com.neueda.leap.marketdata.MarketQuote;
import java.time.OffsetDateTime;
import java.util.Optional;
/** Quote evidence and action to be consumed by the fill executor. */
public record ExecutionQuoteDecision(Action action,Reason reason,MarketQuote quote,OffsetDateTime evaluatedAt){
 public Optional<MarketQuote> selectedQuote(){return Optional.ofNullable(quote);}
 public enum Action{CONTINUE,REQUEUE,REJECT}
 public enum Reason{QUOTE_FRESH,QUOTE_UNAVAILABLE,STALE_QUOTE,INVALID_QUOTE_TIMESTAMP}
}
