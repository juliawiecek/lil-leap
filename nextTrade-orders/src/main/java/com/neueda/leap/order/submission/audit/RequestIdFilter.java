package com.neueda.leap.order.submission.audit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Gives each order submission a request id, returned as {@code X-Request-Id} whether the order is
 * accepted or refused, so a refused order can be looked up in the audit log (TS-15.5).
 */
@Component
public class RequestIdFilter extends OncePerRequestFilter {
    /** Response header carrying the submission's request id. */
    public static final String HEADER = "X-Request-Id";
    /** Request attribute holding the id as a {@link UUID}. */
    public static final String ATTRIBUTE = "com.neueda.leap.order.submission.audit.requestId";

    /** Creates the filter; Spring registers it. */
    public RequestIdFilter() {
        // No state to initialize.
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !"POST".equals(request.getMethod()) || !(path.endsWith("/orders") || path.endsWith("/orders/"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        UUID requestId = UUID.randomUUID();
        request.setAttribute(ATTRIBUTE, requestId);
        response.setHeader(HEADER, requestId.toString());
        chain.doFilter(request, response);
    }
}
