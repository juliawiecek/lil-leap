package com.neueda.leap.order.submission;

import com.neueda.leap.marketdata.MarketQuote;
import com.neueda.leap.marketdata.QuoteRepository;
import com.neueda.leap.order.service.OrderSufficiencyException;
import com.neueda.leap.order.service.OrderSufficiencyService;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.OrderSufficiencyRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static com.neueda.leap.order.service.OrderSufficiencyException.Reason.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderSufficiencyServiceTest {
    private final UUID account = UUID.randomUUID();
    private final UUID instrument = UUID.randomUUID();
    private OrderSufficiencyRepository balances;
    private QuoteRepository quotes;
    private OrderSufficiencyService service;

    @BeforeEach
    void setUp() {
        balances = mock(OrderSufficiencyRepository.class);
        quotes = mock(QuoteRepository.class);
        service = new OrderSufficiencyService(balances, quotes);
    }

    @ParameterizedTest
    @CsvSource({"1020.00,true", "1020.01,true", "1019.99,false", "0,false"})
    void buysRequireBufferedAskCost(String cash, boolean sufficient) {
        quote(new BigDecimal("100.00"));
        when(balances.executionBufferPercent(account)).thenReturn(new BigDecimal("2.00"));
        when(balances.cashBalance(account)).thenReturn(new BigDecimal(cash));
        check(request("buy", 10, null), sufficient, INSUFFICIENT_CASH);
        verify(balances, never()).holdingQuantity(any(), any());
    }

    @ParameterizedTest
    @CsvSource({"0,1000.00,true", "0,999.99,false", "5,1050.00,true", "5,1049.99,false"})
    void explicitBufferOverridesAccountDefault(String buffer, String cash, boolean sufficient) {
        quote(new BigDecimal("100"));
        when(balances.cashBalance(account)).thenReturn(new BigDecimal(cash));
        check(request("BUY", 10, new BigDecimal(buffer)), sufficient, INSUFFICIENT_CASH);
        verify(balances, never()).executionBufferPercent(any());
    }

    @ParameterizedTest
    @CsvSource({"30.00,false", "30.01,true"})
    void roundsUpOnceAfterMultiplication(String cash, boolean sufficient) {
        quote(new BigDecimal("10.00000001"));
        when(balances.cashBalance(account)).thenReturn(new BigDecimal(cash));
        check(request("BUY", 3, BigDecimal.ZERO), sufficient, INSUFFICIENT_CASH);
    }

    @Test
    void missingQuoteRejectsBuyWithoutReadingCash() {
        check(request("BUY", 10, BigDecimal.ZERO), false, QUOTE_UNAVAILABLE);
        verifyNoInteractions(balances);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"0", "-0.01"})
    void invalidAskRejectsBuy(String ask) {
        quote(ask == null ? null : new BigDecimal(ask));
        check(request("BUY", 10, BigDecimal.ZERO), false, QUOTE_UNAVAILABLE);
    }

    @ParameterizedTest
    @CsvSource({"0,false", "9,false", "10,true", "11,true"})
    void sellsRequireOwnedUnitsAndDoNotNeedCashOrQuotes(long owned, boolean sufficient) {
        when(balances.holdingQuantity(account, instrument)).thenReturn(owned);
        check(request("sell", 10, null), sufficient, INSUFFICIENT_HOLDINGS);
        verifyNoInteractions(quotes);
        verify(balances, never()).cashBalance(any());
        verify(balances, never()).executionBufferPercent(any());
    }

    @Test
    void largeQuantityDoesNotOverflowBuyingPower() {
        quote(new BigDecimal("9999999999.99999999"));
        when(balances.cashBalance(account)).thenReturn(new BigDecimal("9999999999999999.99"));
        check(request("BUY", Long.MAX_VALUE, new BigDecimal("999.99")), false, INSUFFICIENT_CASH);
    }

    @ParameterizedTest
    @CsvSource({"BUY,0", "SELL,-1", "HOLD,1"})
    void rejectsInvalidInternalRequests(String side, long quantity) {
        assertThatIllegalArgumentException().isThrownBy(() -> service.validate(request(side, quantity, null), instrument));
        verifyNoInteractions(balances, quotes);
    }

    private void quote(BigDecimal ask) {
        when(quotes.findLatestByInstrumentId(instrument)).thenReturn(Optional.of(new MarketQuote(
                UUID.randomUUID(), instrument, "AAPL", "NASDAQ", BigDecimal.ONE, ask,
                BigDecimal.ONE, OffsetDateTime.now(), "TEST", true)));
    }

    private SubmitOrderRequest request(String side, long quantity, BigDecimal buffer) {
        return new SubmitOrderRequest(account, "AAPL", UUID.randomUUID(), side, quantity, "MARKET", buffer);
    }

    private void check(SubmitOrderRequest request, boolean sufficient, OrderSufficiencyException.Reason reason) {
        if (sufficient) {
            assertThatCode(() -> service.validate(request, instrument)).doesNotThrowAnyException();
        } else {
            assertThatThrownBy(() -> service.validate(request, instrument))
                    .isInstanceOfSatisfying(OrderSufficiencyException.class,
                            error -> assertThat(error.reason()).isEqualTo(reason));
        }
    }
}
