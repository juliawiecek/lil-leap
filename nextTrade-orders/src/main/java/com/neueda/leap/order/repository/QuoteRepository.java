package com.neueda.leap.order.repository;

import com.neueda.leap.order.model.Quote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Quote entities.
 * Provides database access for market quotes with quote retrieval patterns.
 */
@Repository
public interface QuoteRepository extends JpaRepository<Quote, UUID> {
    
    /**
     * Find the latest quote for an instrument.
     * Orders by quoted_at DESC to get the most recent quote.
     *
     * @param instrumentId persistent instrument identifier
     * @return latest quote, or empty when no quote exists
     */
    @Query(value = "SELECT * FROM quotes WHERE instrument_id = :instrumentId " +
           "ORDER BY quoted_at DESC LIMIT 1", nativeQuery = true)
    Optional<Quote> findLatestByInstrumentId(@Param("instrumentId") UUID instrumentId);
}
