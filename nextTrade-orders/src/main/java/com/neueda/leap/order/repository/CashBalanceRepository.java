package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.CashBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for CashBalance entities (the cash_balances cache table).
 */
@Repository
public interface CashBalanceRepository extends JpaRepository<CashBalance, UUID> {

    /**
     * Finds the cash balances for every account owned by the given user.
     *
     * @param userId authenticated user's identifier, joined through accounts.user_id
     * @return owned balances, or an empty list when none exist
     */
    List<CashBalance> findByAccount_UserId(UUID userId);

    /**
     * Finds and locks the cash balance row for one account, within the
     * caller's transaction, so concurrent fills on the same account cannot
     * interleave. Returns empty when the account has no balance row yet.
     *
     * @param accountId account owning the balance
     * @return the locked balance, or empty when no row exists yet
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<CashBalance> findByAccountId(UUID accountId);
}
