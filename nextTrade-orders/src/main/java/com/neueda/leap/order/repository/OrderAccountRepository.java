package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.Account;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for the trading view of accounts used by order submission.
 */
@Repository
public interface OrderAccountRepository extends JpaRepository<Account, UUID> {

    /**
     * Finds an account only when it belongs to the given user.
     *
     * @param accountId persistent account identifier
     * @param userId authenticated user's identifier
     * @return the owned account, or empty when absent or owned by someone else
     */
    Optional<Account> findByAccountIdAndUserId(UUID accountId, UUID userId);

    /**
     * Finds and locks an account row within the caller's transaction, so
     * concurrent settlements against the same account serialize instead of
     * racing. Per the TS-10.1 settlement contract this is acquired before
     * the account's cash/holdings rows.
     *
     * @param accountId persistent account identifier
     * @return the locked account, or empty when absent
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Account> findWithLockByAccountId(UUID accountId);
}
