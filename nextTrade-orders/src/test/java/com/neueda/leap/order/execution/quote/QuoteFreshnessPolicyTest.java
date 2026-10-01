package com.neueda.leap.order.execution.quote;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import java.time.OffsetDateTime;
import static org.assertj.core.api.Assertions.assertThat;
class QuoteFreshnessPolicyTest {
 private final QuoteFreshnessPolicy policy=new QuoteFreshnessPolicy(Duration.ofSeconds(60),Duration.ofSeconds(2));
 private final OffsetDateTime now=OffsetDateTime.parse("2026-09-23T15:00:00Z");
 @Test void boundaryIsFresh(){assertThat(policy.evaluate(now.minusSeconds(60),now)).isEqualTo(QuoteFreshnessPolicy.Freshness.FRESH);}
 @Test void olderThanThresholdIsStale(){assertThat(policy.evaluate(now.minusSeconds(61),now)).isEqualTo(QuoteFreshnessPolicy.Freshness.STALE);}
 @Test void excessiveFutureSkewIsInvalid(){assertThat(policy.evaluate(now.plusSeconds(3),now)).isEqualTo(QuoteFreshnessPolicy.Freshness.INVALID_FUTURE_TIMESTAMP);}
}
