package com.neueda.leap.order.execution.quote;
import com.neueda.leap.marketdata.QuoteRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.time.Clock;
import java.time.Duration;
@Configuration
public class ExecutionQuoteConfiguration {
 @Bean Clock executionClock(){return Clock.systemUTC();}
 @Bean QuoteFreshnessPolicy executionQuoteFreshnessPolicy(@Value("${orders.execution.max-quote-age-seconds:60}") long age,@Value("${orders.execution.allowed-future-skew-seconds:2}") long skew){return new QuoteFreshnessPolicy(Duration.ofSeconds(age),Duration.ofSeconds(skew));}
 @Bean ExecutionQuoteService executionQuoteService(ExecutionOrderContextRepository orders,QuoteRepository quotes,QuoteFreshnessPolicy policy,Clock executionClock,@Value("${orders.execution.max-quote-attempts:10}") long attempts){return new ExecutionQuoteService(orders,quotes,policy,executionClock,attempts);}
}
