package com.neueda.leap.order.execution.quote;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Objects;
/** Validates quote timestamps against the execution instant. */
public class QuoteFreshnessPolicy {
 private final Duration maximumAge, allowedFutureSkew;
 public QuoteFreshnessPolicy(Duration maximumAge,Duration allowedFutureSkew){
  if(maximumAge==null||maximumAge.isZero()||maximumAge.isNegative()) throw new IllegalArgumentException("Maximum quote age must be positive");
  if(allowedFutureSkew==null||allowedFutureSkew.isNegative()) throw new IllegalArgumentException("Allowed future skew cannot be negative");
  this.maximumAge=maximumAge; this.allowedFutureSkew=allowedFutureSkew;
 }
 public Freshness evaluate(OffsetDateTime quotedAt,OffsetDateTime evaluatedAt){
  Objects.requireNonNull(quotedAt); Objects.requireNonNull(evaluatedAt);
  if(quotedAt.isAfter(evaluatedAt.plus(allowedFutureSkew))) return Freshness.INVALID_FUTURE_TIMESTAMP;
  Duration age=Duration.between(quotedAt,evaluatedAt); if(age.isNegative()) age=Duration.ZERO;
  return age.compareTo(maximumAge)<=0?Freshness.FRESH:Freshness.STALE;
 }
 public enum Freshness{FRESH,STALE,INVALID_FUTURE_TIMESTAMP}
}
