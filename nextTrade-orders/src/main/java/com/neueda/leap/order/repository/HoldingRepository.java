package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.Holding;
import com.neueda.leap.order.model.HoldingId;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Holding entities (the holdings cache table).
 */
@Repository
public interface HoldingRepository extends JpaRepository<Holding, HoldingId> {

    /**
     * Finds and locks the holding row for one account/instrument pair, within
     * the caller's transaction, so concurrent fills on the same position
     * cannot interleave. Returns empty when no position exists yet.
     *
     * @param accountId account owning the holding
     * @param instrumentId instrument held
     * @return the locked holding, or empty when no position exists yet
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Holding> findByAccountIdAndInstrumentId(UUID accountId, UUID instrumentId);
}
