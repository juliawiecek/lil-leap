package com.neueda.leap.order.service;

import com.neueda.leap.order.dto.CashBalanceResponse;
import com.neueda.leap.order.model.CashBalance;
import com.neueda.leap.order.repository.CashBalanceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Reads cash balances for the authenticated client only.
 *
 * <p>Ownership is derived by joining through accounts.user_id, mirroring
 * insights' ClientFinancialQueryService.getCashBalances: the caller never
 * supplies an account id directly, so an object identifier cannot override
 * the identity established by the validated JWT.</p>
 */
@Service
@Transactional(readOnly = true)
public class CashBalanceQueryService {

    private final CashBalanceRepository repository;

    /**
     * Creates the client-scoped cash balance query service.
     *
     * @param repository database access for the cash_balances cache table
     */
    public CashBalanceQueryService(CashBalanceRepository repository) {
        this.repository = repository;
    }

    /**
     * Reads cash balances across the user's accounts, sorted by account.
     *
     * @param authenticatedUserId identity from the validated JWT, never a request selector
     * @return owned cash balances, or an empty list when none exist
     */
    public List<CashBalanceResponse> getCashBalances(UUID authenticatedUserId) {
        return repository.findByAccount_UserId(authenticatedUserId).stream()
                .map(CashBalanceQueryService::toResponse)
                .sorted((a, b) -> a.accountId().compareTo(b.accountId()))
                .toList();
    }

    private static CashBalanceResponse toResponse(CashBalance cashBalance) {
        return new CashBalanceResponse(
                cashBalance.getAccountId(),
                cashBalance.getCurrency(),
                cashBalance.getBalance(),
                cashBalance.getUpdatedAt());
    }
}
