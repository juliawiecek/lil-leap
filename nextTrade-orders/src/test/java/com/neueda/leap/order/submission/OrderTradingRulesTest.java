package com.neueda.leap.order.submission;

import com.neueda.leap.order.rules.OrderRuleException;
import com.neueda.leap.instrument.dto.InstrumentResponse;
import com.neueda.leap.instrument.service.InstrumentService;
import com.neueda.leap.order.service.OrderSufficiencyService;
import com.neueda.leap.order.service.OrderSufficiencyException;
import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;
import com.neueda.leap.order.submission.dto.SubmitOrderRequest;
import com.neueda.leap.order.submission.repository.*;
import com.neueda.leap.order.submission.service.OrderSubmissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import static com.neueda.leap.order.rules.OrderRuleException.Reason.*;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class OrderTradingRulesTest {
    private final UUID user = UUID.randomUUID(), account = UUID.randomUUID(), instrument = UUID.randomUUID();
    private OrderSubmissionRepository repository;
    private OrderSufficiencyService sufficiency;
    private OrderSubmissionService service;
    private final InstrumentService instruments = mock(InstrumentService.class);
    @BeforeEach void setUp() {
        repository = mock(OrderSubmissionRepository.class); sufficiency = mock(OrderSufficiencyService.class);
        service = new OrderSubmissionService(repository, sufficiency, instruments);
        when(repository.accountBelongsToUser(account, user)).thenReturn(true);
        when(repository.findByAccountAndClientReference(any(), any())).thenReturn(Optional.empty());
        when(repository.findClientCountry(account)).thenReturn(Optional.of("US"));
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, "NOVICE", new BigDecimal("5000"), new BigDecimal("5000"))));
    }
    @Test void blockedAccountIsRejectedBeforeInstrumentLookup() {
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("BLOCKED", true, "NOVICE", BigDecimal.ONE, BigDecimal.TEN)));
        expect(request("AAPL"), ACCOUNT_NOT_ACTIVE); verifyNoInteractions(instruments);
    }
    @Test void tradingDisabledAccountIsRejected() {
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", false, "NOVICE", BigDecimal.ONE, BigDecimal.TEN)));
        expect(request("AAPL"), TRADING_NOT_ENABLED);
    }
    @ParameterizedTest
    @CsvSource({"NOVICE,5000,1000,BUY", "NOVICE,5000,1000,SELL", "NOVICE,5000,0,SELL",
            "ADVANCED,100000,1000,BUY", "ADVANCED,100000,0,SELL"})
    void belowOpeningMinimumCanSubmitWhenResourcesAreSufficient(String tier, String minimum, String cash, String side) {
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, tier, new BigDecimal(minimum), new BigDecimal(cash))));
        var request = new SubmitOrderRequest(account, "AAPL", UUID.randomUUID(), side, 1, "MARKET", BigDecimal.ZERO);
        var saved = new OrderSubmissionResponse(UUID.randomUUID(), account, instrument, "AAPL", request.clientReference(),
                side, 1, "MARKET", "SUBMITTED", Instant.now(), BigDecimal.ZERO);
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument(instrument, true, true)));
        when(repository.insert(request, instrument, "AAPL")).thenReturn(Optional.of(saved));

        var result = service.submit(user, request);

        assertThat(result.created()).isTrue();
        assertThat(result.order()).isEqualTo(saved);
        var sequence = inOrder(sufficiency, repository);
        sequence.verify(sufficiency).validate(request, instrument);
        sequence.verify(repository).insert(request, instrument, "AAPL");
    }
    @ParameterizedTest
    @CsvSource({"BUY,INSUFFICIENT_CASH", "SELL,INSUFFICIENT_HOLDINGS"})
    void belowOpeningMinimumStillRequiresOrderResources(String side, OrderSufficiencyException.Reason reason) {
        when(repository.findAccountTradingProfile(account)).thenReturn(Optional.of(
                new AccountTradingProfile("ACTIVE", true, "NOVICE", new BigDecimal("5000"), BigDecimal.ZERO)));
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument(instrument, true, true)));
        var request = new SubmitOrderRequest(account, "AAPL", UUID.randomUUID(), side, 1, "MARKET", BigDecimal.ZERO);
        doThrow(new OrderSufficiencyException(reason)).when(sufficiency).validate(request, instrument);

        assertThatThrownBy(() -> service.submit(user, request)).isInstanceOfSatisfying(OrderSufficiencyException.class,
                error -> assertThat(error.reason()).isEqualTo(reason));
        verify(repository, never()).insert(any(), any(), any());
    }
    @Test void unsupportedInstrumentHasSpecificReason() { expect(request("NOPE"), INSTRUMENT_UNSUPPORTED); }
    @Test void disabledInstrumentHasSpecificReason() {
        when(instruments.findInstrumentBySymbol("AAPL"))
                .thenReturn(Optional.of(instrument(instrument, false, true)));
        expect(request("AAPL"), INSTRUMENT_DISABLED);
    }
    @Test void haltedOrRestrictedInstrumentHasSpecificReason() {
        when(instruments.findInstrumentBySymbol("AAPL"))
                .thenReturn(Optional.of(instrument(instrument, true, false)));
        expect(request("AAPL"), INSTRUMENT_NOT_TRADABLE);
    }
    @Test void nonUsClientIsRejectedBeforeResourceChecks() {
        when(repository.findClientCountry(account)).thenReturn(Optional.of("Canada"));
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument(instrument, true, true)));
        expect(request("AAPL"), LOCATION_RESTRICTED);
    }
    @Test void clientWithoutCountryIsRejected() {
        when(repository.findClientCountry(account)).thenReturn(Optional.empty());
        when(instruments.findInstrumentBySymbol("AAPL")).thenReturn(Optional.of(instrument(instrument, true, true)));
        expect(request("AAPL"), LOCATION_RESTRICTED);
    }
    @Test void nonUsMarketIsRejectedForUsClient() {
        when(instruments.findInstrumentBySymbol("BTC")).thenReturn(Optional.of(new InstrumentResponse(instrument,
                "BTC", "Bitcoin", "CRYPTO", "CRYPTO", "USD", null, true, true)));
        expect(request("BTC"), LOCATION_RESTRICTED);
    }
    private SubmitOrderRequest request(String symbol) {
        return new SubmitOrderRequest(account, symbol, UUID.randomUUID(), "BUY", 1, "MARKET", BigDecimal.ZERO);
    }
    private void expect(SubmitOrderRequest request, OrderRuleException.Reason reason) {
        assertThatThrownBy(() -> service.submit(user, request)).isInstanceOfSatisfying(OrderRuleException.class,
                error -> org.assertj.core.api.Assertions.assertThat(error.reason()).isEqualTo(reason));
        verifyNoInteractions(sufficiency);
    }
    private static InstrumentResponse instrument(UUID id, boolean enabled, boolean tradable) {
        return new InstrumentResponse(id, "AAPL", "Apple Inc.", "COMMON_STOCK",
                "NASDAQ", "USD", "Technology", enabled, tradable);
    }
}
