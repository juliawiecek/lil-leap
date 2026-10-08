package com.neueda.leap.order.settlement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Looks for partly applied settlements at startup and on a schedule (TS-10.3 AC1), so a broken
 * settlement is found by the platform rather than by a client noticing stale balances.
 */
@Component
@ConditionalOnProperty(name = "orders.settlement.integrity-check.enabled", havingValue = "true", matchIfMissing = true)
public class SettlementIntegrityCheck {
    private static final Logger log = LoggerFactory.getLogger(SettlementIntegrityCheck.class);
    private final SettlementRecoveryService settlements;

    /**
     * Creates the check.
     *
     * @param settlements detection and audit of incomplete settlements
     */
    public SettlementIntegrityCheck(SettlementRecoveryService settlements) {
        this.settlements = settlements;
    }

    /** Checks once as soon as the service is ready to take traffic. */
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        run();
    }

    /** Checks again on a fixed delay, five minutes by default. */
    @Scheduled(fixedDelayString = "${orders.settlement.integrity-check-ms:300000}",
            initialDelayString = "${orders.settlement.integrity-check-ms:300000}")
    public void onSchedule() {
        run();
    }

    /**
     * Runs one check; a failure is logged and retried on the next run rather than stopping the service.
     *
     * @return number of incomplete settlements found, or -1 when the check could not run
     */
    int run() {
        try {
            int found = settlements.reportIncomplete().size();
            if (found > 0) {
                log.warn("Settlement integrity check found {} incomplete settlement(s); see {} in audit_log",
                        found, SettlementRecoveryService.INCOMPLETE);
            }
            return found;
        } catch (RuntimeException failure) {
            // Avoid logging exception text that could contain account details.
            log.warn("Settlement integrity check could not run ({})", failure.getClass().getSimpleName());
            return -1;
        }
    }
}
