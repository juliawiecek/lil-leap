package com.neueda.leap.common.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void explicitStatusHidesRequestDetails() {
        var response = handler.handleStatusException(new ResponseStatusException(HttpStatus.CONFLICT, "private-token"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).containsEntry("error", "REQUEST_FAILED")
                .containsEntry("message", "The request could not be completed.");
    }

    @Test
    void frameworkFailurePreservesStatusAndAllowHeader() {
        var response = handler.handleUnexpectedException(new HttpRequestMethodNotSupportedException("POST", java.util.List.of("GET")));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(response.getHeaders().getFirst("Allow")).isEqualTo("GET");
        assertThat(response.getBody()).containsEntry("error", "REQUEST_FAILED");
    }

    @Test
    void unexpectedFailureReturnsSafeServerError() {
        var response = handler.handleUnexpectedException(new IllegalStateException("private-token"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).containsEntry("error", "INTERNAL_ERROR")
                .containsEntry("message", "The request could not be completed.");
    }

    @Test
    void invalidPayloadDoesNotEchoRejectedValue() {
        var response = handler.handleInvalidRequest(new IllegalArgumentException("private-token"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).containsEntry("error", "INVALID_REQUEST")
                .containsEntry("message", "The request contains invalid or missing fields.");
    }
    @Test
    void clientAndFilterFailuresUseFixedBodies() {
        var failure = new IllegalArgumentException("private-client-id");
        var missing = handler.clientNotFound(failure);
        assertThat(missing.getStatusCode().value()).isEqualTo(404);
        assertThat(missing.getBody()).containsEntry("error", "CLIENT_NOT_FOUND").containsEntry("message", "Client not found");
        var invalid = handler.invalidFilter(failure);
        assertThat(invalid.getStatusCode().value()).isEqualTo(400);
        assertThat(invalid.getBody()).containsEntry("error", "INVALID_FILTER").containsEntry("message", "Invalid order history filter");
    }
}
