package com.neueda.leap.reporting.repository;

import com.neueda.leap.reporting.dto.ClientSegmentActivityResponse;
import com.neueda.leap.reporting.dto.DailyTradeActivityResponse;
import com.neueda.leap.reporting.dto.InsightsOverviewResponse;
import com.neueda.leap.reporting.dto.InstrumentActivityResponse;
import com.neueda.leap.reporting.dto.TopInstrumentResponse;
import com.neueda.leap.reporting.model.ReportDateRange;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;

/**
 * Temporary {@link TradeReportingRepository} that reports no activity.
 *
 * <p>Returns empty results rather than fabricated figures so dashboards never
 * display misleading numbers before the reporting store exists.</p>
 *
 * <p>TODO: replace with a JDBC/JPA implementation once the reporting schema and
 * the trading-event consumer that populates it are in place. That implementation
 * should use a dedicated read-only datasource pointing at the reporting database.</p>
 */
@Repository
public class PlaceholderTradeReportingRepository implements TradeReportingRepository {

    /** Creates the placeholder repository. */
    public PlaceholderTradeReportingRepository() {
    }

    /** {@inheritDoc} */
    @Override
    public List<InstrumentActivityResponse> aggregateByInstrument(ReportDateRange range) {
        return List.of();
    }

    /** {@inheritDoc} */
    @Override
    public List<ClientSegmentActivityResponse> aggregateByClientSegment(ReportDateRange range) {
        return List.of();
    }

    /** {@inheritDoc} */
    @Override
    public InsightsOverviewResponse summarize(ReportDateRange range) {
        return new InsightsOverviewResponse(0, 0, 0, BigDecimal.ZERO.setScale(2));
    }

    /** {@inheritDoc} */
    @Override
    public List<TopInstrumentResponse> findTopInstrumentsByTradeCount(ReportDateRange range, int limit) {
        return List.of();
    }

    /** {@inheritDoc} */
    @Override
    public List<DailyTradeActivityResponse> countTradesByDay(ReportDateRange range) {
        return List.of();
    }
}
