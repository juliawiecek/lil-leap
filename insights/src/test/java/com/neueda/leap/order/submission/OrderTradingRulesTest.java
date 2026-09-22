package com.neueda.leap.order.submission;

import com.neueda.leap.order.rules.OrderRuleException;
import com.neueda.leap.order.service.OrderSufficiencyService;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.*;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import static com.neueda.leap.order.rules.OrderRuleException.Reason.*;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class OrderTradingRulesTest {
    private final UUID user = UUID.randomUUID(), account = UUID.randomUUID(), instrument = UUID.randomUUID();
    private OrderSubmissionRepository repository;
    private OrderSufficiencyService sufficiency;
    private OrderSubmissionService service;
    @BeforeEach void setUp() {
        repository = mock(OrderSubmissionRepository.class); sufficiency = mock(OrderSufficiencyService.class);
        service = new OrderSubmissionService(repository, sufficiency);
        when(repository.accountBelongsToUser(account, user)).thenReturn(true);
        when(repository.findByAccountAndClientReference(any(), any())).thenReturn(Optional.empty());
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, "NOVICE", new BigDecimal("5000"), new BigDecimal("5000"))));
    }
    @Test void blockedAccountIsRejectedBeforeInstrumentLookup() {
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("BLOCKED", true, "NOVICE", BigDecimal.ONE, BigDecimal.TEN)));
        expect(request("AAPL"), ACCOUNT_NOT_ACTIVE); verify(repository, never()).findInstrumentTradingProfileBySymbol(any());
    }
    @Test void tradingDisabledAccountIsRejected() {
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", false, "NOVICE", BigDecimal.ONE, BigDecimal.TEN)));
        expect(request("AAPL"), TRADING_NOT_ENABLED);
    }
    @Test void unsuitableTierBalanceIsRejected() {
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, "ADVANCED", new BigDecimal("100000"), new BigDecimal("99999.99"))));
        expect(request("AAPL"), ACCOUNT_NOT_SUITABLE);
    }
    @Test void unsupportedInstrumentHasSpecificReason() { expect(request("NOPE"), INSTRUMENT_UNSUPPORTED); }
    @Test void disabledInstrumentHasSpecificReason() {
        when(repository.findInstrumentTradingProfileBySymbol("AAPL"))
                .thenReturn(Optional.of(new InstrumentTradingProfile(instrument, false, true)));
        expect(request("AAPL"), INSTRUMENT_DISABLED);
    }
    @Test void haltedOrRestrictedInstrumentHasSpecificReason() {
        when(repository.findInstrumentTradingProfileBySymbol("AAPL"))
                .thenReturn(Optional.of(new InstrumentTradingProfile(instrument, true, false)));
        expect(request("AAPL"), INSTRUMENT_NOT_TRADABLE);
    }
    private SubmitOrderRequest request(String symbol) {
        return new SubmitOrderRequest(account, symbol, UUID.randomUUID(), "BUY", 1, "MARKET", BigDecimal.ZERO);
    }
    private void expect(SubmitOrderRequest request, OrderRuleException.Reason reason) {
        assertThatThrownBy(() -> service.submit(user, request)).isInstanceOfSatisfying(OrderRuleException.class,
                error -> org.assertj.core.api.Assertions.assertThat(error.reason()).isEqualTo(reason));
        verifyNoInteractions(sufficiency);
    }
}
