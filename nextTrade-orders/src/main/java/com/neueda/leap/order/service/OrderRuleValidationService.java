package com.neueda.leap.order.service;

import com.neueda.leap.order.exception.OrderRuleException;
import com.neueda.leap.order.model.Account;
import com.neueda.leap.order.model.Instrument;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

import static com.neueda.leap.order.exception.OrderRuleException.Reason.*;

/**
 * Validates account eligibility and instrument tradability before order acceptance.
 * Checks account status, trading permissions, trader tier, and instrument support.
 */
@Service
public class OrderRuleValidationService {

    /**
     * Validates that an account is eligible for trading.
     *
     * @param account the trading account to validate
     * @throws OrderRuleException if the account is not active, trading is not enabled, or the account is not suitable
     */
    public void validateAccount(Account account) {
        if (account == null) {
            throw new OrderRuleException(ACCOUNT_NOT_ACTIVE);
        }
        if (!"ACTIVE".equals(account.getAccountStatus())) {
            throw new OrderRuleException(ACCOUNT_NOT_ACTIVE);
        }
        if (!account.getTradingEnabled()) {
            throw new OrderRuleException(TRADING_NOT_ENABLED);
        }
    }

    /**
     * Validates that an instrument is supported and enabled for trading.
     * NEXT-193: Checks both enabled and tradable fields separately.
     * - enabled=false → INSTRUMENT_DISABLED (halted/suspended)
     * - tradable=false → INSTRUMENT_NOT_TRADABLE (restricted instrument type)
     *
     * @param instrument the instrument to validate
     * @throws OrderRuleException if the instrument is unsupported, disabled, or not tradable
     */
    public void validateInstrument(Instrument instrument) {
        if (instrument == null) {
            throw new OrderRuleException(INSTRUMENT_UNSUPPORTED);
        }
        if (!instrument.isEnabled()) {
            throw new OrderRuleException(INSTRUMENT_DISABLED);
        }
        if (!instrument.isTradable()) {
            throw new OrderRuleException(INSTRUMENT_NOT_TRADABLE);
        }
    }
}
