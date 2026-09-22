package com.neueda.leap.order.service;

import com.neueda.leap.order.submission.repository.OrderJurisdictionRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

import static com.neueda.leap.order.service.OrderJurisdictionException.Reason.LOCATION_RESTRICTED;
import static com.neueda.leap.order.service.OrderJurisdictionException.Reason.LOCATION_UNAVAILABLE;

/** Enforces instrument restrictions using the client's persisted registration country. */
@Service
public class OrderJurisdictionService {
    private final OrderJurisdictionRepository repository;

    /**
     * Creates the jurisdiction rule checker.
     * @param repository registered location and restriction queries
     */
    public OrderJurisdictionService(OrderJurisdictionRepository repository) {
        this.repository = repository;
    }

    /**
     * Rejects missing/unknown locations and enabled country restrictions before
     * a new order is saved. Applies equally to BUY and SELL orders.
     * @param userId authenticated client, after account ownership authorization
     * @param instrumentId resolved tradable instrument
     * @throws OrderJurisdictionException if the country is unavailable or restricted
     */
    public void validate(UUID userId, UUID instrumentId) {
        String country = repository.registeredCountry(userId).flatMap(RegisteredCountry::code)
                .orElseThrow(() -> new OrderJurisdictionException(LOCATION_UNAVAILABLE));
        if (repository.isRestricted(instrumentId, country)) {
            throw new OrderJurisdictionException(LOCATION_RESTRICTED);
        }
    }
}
