package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.dto.ClientSegmentActivityResponse;
import com.neueda.leap.reporting.dto.DailyTradeActivityResponse;
import com.neueda.leap.reporting.dto.InsightsOverviewResponse;
import com.neueda.leap.reporting.dto.InstrumentActivityResponse;
import com.neueda.leap.reporting.dto.TopInstrumentResponse;
import com.neueda.leap.reporting.model.ReportDateRange;

import java.util.List;

/** Read-only trading reports and dashboard insights for internal stakeholders. */
public interface ReportingService {

    /** Default number of instruments returned by {@link #getTopInstruments}. */
    int DEFAULT_TOP_INSTRUMENTS_LIMIT = 10;

    /** Maximum number of instruments returned by {@link #getTopInstruments}. */
    int MAX_TOP_INSTRUMENTS_LIMIT = 100;

    /**
     * Returns trading activity aggregated per instrument.
     *
     * @param range validated reporting window
     * @return per-instrument totals, empty when there was no activity
     */
    List<InstrumentActivityResponse> getActivityByInstrument(ReportDateRange range);

    /**
     * Returns trading activity aggregated per client segment.
     *
     * @param range validated reporting window
     * @return per-segment totals, empty when there was no activity
     */
    List<ClientSegmentActivityResponse> getActivityByClientSegment(ReportDateRange range);

    /**
     * Returns the dashboard summary.
     *
     * @param range validated reporting window
     * @return overall totals, with zero values when there was no activity
     */
    InsightsOverviewResponse getOverview(ReportDateRange range);

    /**
     * Returns the most actively traded instruments.
     *
     * @param range validated reporting window
     * @param limit maximum number of instruments, between 1 and {@value #MAX_TOP_INSTRUMENTS_LIMIT}
     * @return instruments ordered by trade count descending
     * @throws IllegalArgumentException if {@code limit} is out of bounds
     */
    List<TopInstrumentResponse> getTopInstruments(ReportDateRange range, int limit);

    /**
     * Returns the daily trade count trend for charting.
     *
     * @param range validated reporting window
     * @return one entry per day in the range, in date order, with zero for days without trades
     */
    List<DailyTradeActivityResponse> getClientActivityTrend(ReportDateRange range);
}
