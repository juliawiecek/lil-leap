package com.neueda.leap.order.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * OrderExecutionScheduler periodically executes orders that are due.
 * Runs every second to check for orders that need execution.
 * TS-09.3: Scheduled task for fill-or-reject execution engine.
 */
@Component
public class OrderExecutionScheduler {

    private static final Logger log = LoggerFactory.getLogger(OrderExecutionScheduler.class);
    
    private final OrderExecutionService orderExecutionService;

    /**
     * Creates a {@code OrderExecutionScheduler} with the supplied dependencies.
     *
     * @param orderExecutionService service that processes due orders
     */
    public OrderExecutionScheduler(OrderExecutionService orderExecutionService) {
        this.orderExecutionService = orderExecutionService;
    }
    
    /**
     * Execute orders due for execution.
     * Runs every 1 second (1000 milliseconds).
     * This aligns with the requirement from the database schema:
     * "Scheduled task: Run every 1 second to execute due orders"
     */
    @Scheduled(fixedRate = 1000, initialDelay = 5000)
    public void executeOrdersSchedule() {
        try {
            log.debug("Starting scheduled order execution check");
            orderExecutionService.executeAllDueOrders();
        } catch (Exception e) {
            log.error("Error in scheduled order execution: {}", e.getMessage(), e);
        }
    }
}
