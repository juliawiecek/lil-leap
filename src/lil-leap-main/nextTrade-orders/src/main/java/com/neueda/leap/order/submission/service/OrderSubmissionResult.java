package com.neueda.leap.order.submission.service;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;

/**
 * Distinguishes a new submission from an idempotent retry.
 * @param order the newly saved or previously submitted order
 * @param created true for a new insert (HTTP 201), false for a retry (HTTP 200)
 */
public record OrderSubmissionResult(OrderSubmissionResponse order, boolean created) {
}
