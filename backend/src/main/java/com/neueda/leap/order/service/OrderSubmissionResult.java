package com.neueda.leap.order.service;

import com.neueda.leap.order.api.dto.OrderResponse;

/** Indicates whether submission created a row or replayed an existing order. */
public record OrderSubmissionResult(OrderResponse order, boolean created) {
}
