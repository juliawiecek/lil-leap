package com.neueda.leap.reporting.service;

import com.neueda.leap.reporting.dto.ClientActivityTrendDto;
import com.neueda.leap.reporting.dto.OverviewDto;
import com.neueda.leap.reporting.dto.TopInstrumentDto;
import com.neueda.leap.reporting.model.ReportDateRange;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;

import java.util.List;

/** Read-only dashboard insights and date-bounded CSV report-generation use cases. */
public interface ReportingService {

    /** Fixed number of instruments shown on the MVP dashboard. */
    int TOP_INSTRUMENTS_LIMIT = 10;

    /**
     * Returns the current-day dashboard summary.
     *
     * @return today&apos;s total traded volume, active client count, and trade value
     */
    OverviewDto getOverview();

    /**
     * Returns the most actively traded instruments for today&apos;s Central-time day.
     *
     * @return instruments ordered by today&apos;s trade count descending
     */
    List<TopInstrumentDto> getTopInstruments();

    /**
     * Returns the current-day hourly trading activity trend.
     *
     * @return one entry for each Central hour of today, including zero-count hours
     */
    List<ClientActivityTrendDto> getClientActivityTrend();

    /**
     * Returns the downloadable CSV report aggregated by instrument.
     *
     * @param range Central-time days whose trades are included
     * @return downloadable CSV attachment generated from the reporting dataset
     */
    ResponseEntity<Resource> generateInstrumentReport(ReportDateRange range);

    /**
     * Returns the downloadable CSV report aggregated by client segment.
     *
     * @param range Central-time days whose trades are included
     * @return downloadable CSV attachment generated from the reporting dataset
     */
    ResponseEntity<Resource> generateClientSegmentReport(ReportDateRange range);

    /**
     * Returns the downloadable CSV report aggregated by trading activity.
     *
     * @param range Central-time days whose trades are included
     * @return downloadable CSV attachment generated from the reporting dataset
     */
    ResponseEntity<Resource> generateTradingActivityReport(ReportDateRange range);

    /**
     * Returns the downloadable CSV report comparing bought and sold quantity and notional per instrument.
     *
     * @param range Central-time days whose trades are included
     * @return downloadable CSV attachment generated from the reporting dataset
     */
    ResponseEntity<Resource> generateBuySellBalanceReport(ReportDateRange range);
}
