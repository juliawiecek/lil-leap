package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.CashBalance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
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
}
