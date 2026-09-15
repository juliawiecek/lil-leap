package com.neueda.leap.order.submission.service;

import com.neueda.leap.order.submission.dto.OrderSubmissionResponse;

public record OrderSubmissionResult(OrderSubmissionResponse order, boolean created) {
}
