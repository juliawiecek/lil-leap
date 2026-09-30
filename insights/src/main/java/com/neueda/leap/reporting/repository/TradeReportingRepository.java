package com.neueda.leap.reporting.repository;

import com.neueda.leap.reporting.dto.ClientSegmentActivityResponse;
import com.neueda.leap.reporting.dto.DailyTradeActivityResponse;
import com.neueda.leap.reporting.dto.InsightsOverviewResponse;
import com.neueda.leap.reporting.dto.InstrumentActivityResponse;
import com.neueda.leap.reporting.dto.TopInstrumentResponse;
import com.neueda.leap.reporting.model.ReportDateRange;

import java.util.List;

/**
 * Read-only aggregation queries over executed trades in the reporting store.
 *
 * <p>The reporting store is populated asynchronously from trading events, so
 * implementations must never query the live trading tables. Every method filters
 * trades by execution time using {@link ReportDateRange#startInclusive()} (inclusive)
 * and {@link ReportDateRange#endExclusive()} (exclusive).</p>
 */
public interface TradeReportingRepository {

    /**
     * Aggregates trades per instrument.
     *
     * @param range execution-time window
     * @return one row per traded instrument, ordered by total trade value descending
     */
    List<InstrumentActivityResponse> aggregateByInstrument(ReportDateRange range);

    /**
     * Aggregates trades per client segment.
     *
     * @param range execution-time window
     * @return one row per segment with activity, ordered by total trade value descending
     */
    List<ClientSegmentActivityResponse> aggregateByClientSegment(ReportDateRange range);

    /**
     * Summarizes all trades in the window.
     *
     * @param range execution-time window
     * @return overall totals; zero values when no trades exist
     */
    InsightsOverviewResponse summarize(ReportDateRange range);

    /**
     * Finds the most actively traded instruments.
     *
     * @param range execution-time window
     * @param limit maximum number of instruments to return
     * @return instruments ordered by trade count descending, then symbol ascending
     */
    List<TopInstrumentResponse> findTopInstrumentsByTradeCount(ReportDateRange range, int limit);

    /**
     * Counts trades per UTC calendar day.
     *
     * @param range execution-time window
     * @return one row per day that had at least one trade, ordered by date ascending
     */
    List<DailyTradeActivityResponse> countTradesByDay(ReportDateRange range);
}
