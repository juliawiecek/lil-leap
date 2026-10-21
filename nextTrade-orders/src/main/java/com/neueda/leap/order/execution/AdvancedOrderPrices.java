package com.neueda.leap.order.execution;

import java.math.BigDecimal;

/** Price conditions use executable ask for buys and bid for sells. */
final class AdvancedOrderPrices {
    private AdvancedOrderPrices() { }
    static boolean eligible(boolean buy, BigDecimal price, BigDecimal limit,
                            BigDecimal profit, BigDecimal stop, boolean exit) {
        if (limit != null && (buy ? price.compareTo(limit) > 0 : price.compareTo(limit) < 0)) return false;
        if (!exit) return true;
        // Exit side is opposite the original entry: a sell takes profit above entry.
        boolean profitHit = profit != null && (buy ? price.compareTo(profit) <= 0 : price.compareTo(profit) >= 0);
        boolean stopHit = stop != null && (buy ? price.compareTo(stop) >= 0 : price.compareTo(stop) <= 0);
        return profitHit || stopHit;
    }
}
