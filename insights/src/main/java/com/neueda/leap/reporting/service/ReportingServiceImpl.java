package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.dto.ClientSegmentActivityResponse;
import com.neueda.leap.reporting.dto.DailyTradeActivityResponse;
import com.neueda.leap.reporting.dto.InsightsOverviewResponse;
import com.neueda.leap.reporting.dto.InstrumentActivityResponse;
import com.neueda.leap.reporting.dto.TopInstrumentResponse;
import com.neueda.leap.reporting.model.ReportDateRange;
import com.neueda.leap.reporting.repository.TradeReportingRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Default {@link ReportingService} backed by the reporting store.
 *
 * <p>TODO: annotate with {@code @Transactional(readOnly = true)} bound to the
 * reporting datasource's transaction manager once that datasource exists, so
 * reporting reads never open transactions against the trading database.</p>
 */
@Service
public class ReportingServiceImpl implements ReportingService {

    /** Source of aggregated trade data. */
    private final TradeReportingRepository repository;

    /**
     * Creates the reporting service.
     *
     * @param repository read-only reporting repository
     */
    public ReportingServiceImpl(TradeReportingRepository repository) {
        this.repository = repository;
    }

    /** {@inheritDoc} */
    @Override
    public List<InstrumentActivityResponse> getActivityByInstrument(ReportDateRange range) {
        return repository.aggregateByInstrument(range);
    }

    /** {@inheritDoc} */
    @Override
    public List<ClientSegmentActivityResponse> getActivityByClientSegment(ReportDateRange range) {
        return repository.aggregateByClientSegment(range);
    }

    /** {@inheritDoc} */
    @Override
    public InsightsOverviewResponse getOverview(ReportDateRange range) {
        return repository.summarize(range);
    }

    /** {@inheritDoc} */
    @Override
    public List<TopInstrumentResponse> getTopInstruments(ReportDateRange range, int limit) {
        if (limit < 1 || limit > MAX_TOP_INSTRUMENTS_LIMIT) {
            throw new IllegalArgumentException("limit must be between 1 and " + MAX_TOP_INSTRUMENTS_LIMIT);
        }
        return repository.findTopInstrumentsByTradeCount(range, limit);
    }

    /**
     * {@inheritDoc}
     *
     * <p>The repository only returns days that had trades; missing days are
     * filled with zero so charts render a continuous time axis.</p>
     */
    @Override
    public List<DailyTradeActivityResponse> getClientActivityTrend(ReportDateRange range) {
        Map<LocalDate, Long> countsByDay = repository.countTradesByDay(range).stream()
                .collect(Collectors.toMap(
                        DailyTradeActivityResponse::date,
                        DailyTradeActivityResponse::tradeCount,
                        Long::sum));

        return range.startDate().datesUntil(range.endDate().plusDays(1))
                .map(day -> new DailyTradeActivityResponse(day, countsByDay.getOrDefault(day, 0L)))
                .toList();
    }
}
