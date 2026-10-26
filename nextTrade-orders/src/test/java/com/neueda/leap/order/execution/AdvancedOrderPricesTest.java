package com.neueda.leap.order.execution;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
class AdvancedOrderPricesTest {
    private BigDecimal n(String value) { return new BigDecimal(value); }
    @Test void limitBuysAndSellsIncludeEqualityAndBetterPrices() {
        assertTrue(AdvancedOrderPrices.eligible(true, n("99"), n("100"), null, null, false));
        assertTrue(AdvancedOrderPrices.eligible(true, n("100"), n("100"), null, null, false));
        assertFalse(AdvancedOrderPrices.eligible(true, n("101"), n("100"), null, null, false));
        assertFalse(AdvancedOrderPrices.eligible(false, n("99"), n("100"), null, null, false));
        assertTrue(AdvancedOrderPrices.eligible(false, n("101"), n("100"), null, null, false));
    }
    @Test void longExitWaitsBetweenLevelsAndTriggersAtEitherBoundary() {
        assertFalse(AdvancedOrderPrices.eligible(false, n("100"), null, n("110"), n("90"), true));
        assertTrue(AdvancedOrderPrices.eligible(false, n("110"), null, n("110"), n("90"), true));
        assertTrue(AdvancedOrderPrices.eligible(false, n("85"), null, n("110"), n("90"), true));
    }
    @Test void sellEntryExitReversesDirectionsAndSupportsIndependentLegs() {
        assertTrue(AdvancedOrderPrices.eligible(true, n("90"), null, n("90"), null, true));
        assertFalse(AdvancedOrderPrices.eligible(true, n("95"), null, n("90"), null, true));
        assertTrue(AdvancedOrderPrices.eligible(true, n("115"), null, null, n("110"), true));
        assertFalse(AdvancedOrderPrices.eligible(true, n("100"), null, null, n("110"), true));
    }
}
