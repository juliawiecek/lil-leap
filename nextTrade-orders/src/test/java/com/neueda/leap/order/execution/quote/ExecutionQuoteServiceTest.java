package com.neueda.leap.order.execution.quote;
import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
class ExecutionQuoteServiceTest {
 private final UUID orderId=UUID.randomUUID(),instrumentId=UUID.randomUUID();
 private final OffsetDateTime now=OffsetDateTime.parse("2026-09-23T15:00:00Z");
 private ExecutionOrderContextRepository orders; private QuoteRepository quotes; private ExecutionQuoteService service;
 @BeforeEach void setup(){orders=mock(ExecutionOrderContextRepository.class);quotes=mock(QuoteRepository.class);service=new ExecutionQuoteService(orders,quotes,new QuoteFreshnessPolicy(Duration.ofSeconds(60),Duration.ofSeconds(2)),Clock.fixed(now.toInstant(),ZoneOffset.UTC),3);when(orders.findForExecution(orderId)).thenReturn(Optional.of(new ExecutionOrderContext(orderId,instrumentId,1)));}
 @Test void freshQuoteContinuesWithEvidence(){var q=quote(now.minusSeconds(5));when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(q));var r=service.selectForExecution(orderId);assertThat(r.action()).isEqualTo(ExecutionQuoteDecision.Action.CONTINUE);assertThat(r.selectedQuote()).contains(q);}
 @Test void staleQuoteRequeuesBeforeLimit(){when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote(now.minusSeconds(61))));assertThat(service.selectForExecution(orderId).action()).isEqualTo(ExecutionQuoteDecision.Action.REQUEUE);}
 @Test void staleQuoteRejectsAtLimit(){when(orders.findForExecution(orderId)).thenReturn(Optional.of(new ExecutionOrderContext(orderId,instrumentId,3)));when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.of(quote(now.minusSeconds(61))));assertThat(service.selectForExecution(orderId).action()).isEqualTo(ExecutionQuoteDecision.Action.REJECT);}
 @Test void missingQuoteRequeues(){when(quotes.findLatestByInstrumentId(instrumentId)).thenReturn(Optional.empty());assertThat(service.selectForExecution(orderId).reason()).isEqualTo(ExecutionQuoteDecision.Reason.QUOTE_UNAVAILABLE);}
 private MarketQuote quote(OffsetDateTime at){return new MarketQuote(UUID.randomUUID(),instrumentId,"AAPL","NASDAQ",new BigDecimal("100.00"),new BigDecimal("100.10"),new BigDecimal("100.05"),at,"SYNTHETIC_GBM",true);}
}
