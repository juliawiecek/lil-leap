package com.neueda.leap.order.market;

import java.time.Instant;

/**
 * Whether the exchange is trading now, with the next session boundaries as UTC instants; clients
 * convert them to the user's local time.
 *
 * @param open true during a regular session
 * @param exchangeTimeZone IANA zone of the exchange, e.g. {@code America/New_York}
 * @param nextOpen start of the next session that begins after now
 * @param nextClose end of the current session, or of the next one when closed
 */
public record MarketStatus(boolean open, String exchangeTimeZone, Instant nextOpen, Instant nextClose) {
}
