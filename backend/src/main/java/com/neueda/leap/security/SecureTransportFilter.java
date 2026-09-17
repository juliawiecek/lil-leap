package com.neueda.leap.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** Rejects plaintext before credentials are parsed; never redirects a credential-bearing request. */
public class SecureTransportFilter extends OncePerRequestFilter {

    /** Creates the filter that rejects requests not received over TLS. */
    public SecureTransportFilter() {
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // Forwarded headers are deliberately not trusted. TLS terminates at this application.
        if (!request.isSecure()) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"HTTPS_REQUIRED\",\"message\":\"HTTPS is required.\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }
}
