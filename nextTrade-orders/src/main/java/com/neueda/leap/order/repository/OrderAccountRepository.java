package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
