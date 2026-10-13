package com.neueda.leap.reporting.repository;

import com.neueda.leap.reporting.entity.TradeFillEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Read-only dashboard queries over existing trading tables.
 */
public interface TradeReportingRepository extends JpaRepository<TradeFillEntity, UUID> {

    /**
     * Summarizes all trades in the window.
     *
     * @param startInclusive inclusive UTC lower bound
     * @param endExclusive exclusive UTC upper bound
     * @return projection with the current dashboard totals
     */
    @Query(value = """
            SELECT
                COALESCE(SUM(f.filled_quantity), 0) AS tradeVolumeToday,
                COALESCE(COUNT(DISTINCT a.user_id), 0) AS activeClientsToday,
                COALESCE(SUM(f.filled_quantity * f.execution_price), 0) AS tradeValueToday
            FROM fills f
            JOIN orders o ON o.order_id = f.order_id
            JOIN accounts a ON a.account_id = o.account_id
            WHERE f.filled_at >= :startInclusive
              AND f.filled_at < :endExclusive
            """, nativeQuery = true)
    OverviewProjection summarize(@Param("startInclusive") Instant startInclusive,
                                 @Param("endExclusive") Instant endExclusive);

    /**
     * Finds the most actively traded instruments in the window.
     *
     * @param startInclusive inclusive UTC lower bound
     * @param endExclusive exclusive UTC upper bound
     * @param pageable limit/offset for ranked results
     * @return projection rows ordered by trade count descending, then symbol ascending
     */
    @Query(value = """
            SELECT
                i.symbol AS instrument,
                COUNT(*) AS tradeCount
            FROM fills f
            JOIN orders o ON o.order_id = f.order_id
            JOIN instruments i ON i.instrument_id = o.instrument_id
            WHERE f.filled_at >= :startInclusive
              AND f.filled_at < :endExclusive
            GROUP BY i.symbol
            ORDER BY COUNT(*) DESC, i.symbol ASC
            """, nativeQuery = true)
    List<TopInstrumentProjection> findTopInstrumentsByTradeCount(@Param("startInclusive") Instant startInclusive,
                                                                 @Param("endExclusive") Instant endExclusive,
                                                                 Pageable pageable);

    /**
     * Returns trades executed in the requested window.
     *
     * @param startInclusive inclusive UTC lower bound
     * @param endExclusive exclusive UTC upper bound
     * @return fills ordered by execution time ascending
     */
    List<TradeFillEntity> findByFilledAtGreaterThanEqualAndFilledAtLessThanOrderByFilledAtAsc(
            Instant startInclusive,
            Instant endExclusive);

    /** Projection for dashboard overview aggregates. */
    interface OverviewProjection {
        /**
         * Returns the number of fills today.
         *
         * @return number of fills today
         */
        Long getTradeVolumeToday();

        /**
         * Returns the number of distinct accounts that traded today.
         *
         * @return number of distinct accounts that traded today
         */
        Long getActiveClientsToday();

        /**
         * Returns the total traded value today.
         *
         * @return total traded value today
         */
        BigDecimal getTradeValueToday();
    }

    /** Projection for ranked instrument activity. */
    interface TopInstrumentProjection {
        /**
         * Returns the instrument symbol.
         *
         * @return instrument symbol
         */
        String getInstrument();

        /**
         * Returns the number of fills for the instrument.
         *
         * @return number of fills for the instrument
         */
        Long getTradeCount();
    }
}
