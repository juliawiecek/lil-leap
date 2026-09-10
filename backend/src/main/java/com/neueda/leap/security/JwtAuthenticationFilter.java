package com.neueda.leap.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * Authenticates requests carrying a {@code Authorization: Bearer <token>} header.
 *
 * <p>A missing header is passed through unauthenticated, so that {@code permitAll}
 * routes such as registration and login keep working; Spring Security's own
 * authorization rules reject unauthenticated requests to protected routes downstream.
 * A header that <em>is</em> present but fails validation is rejected here directly
 * with a 401, since that always indicates a bad or expired token rather than an
 * anonymous request.</p>
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    /**
     * Prefix expected before the token in the {@code Authorization} header.
     */
    private static final String BEARER_PREFIX = "Bearer ";

    /**
     * Service used to validate incoming bearer tokens.
     */
    private final JwtService jwtService;

    /**
     * Creates a new filter backed by the given JWT service.
     *
     * @param jwtService the service used to validate incoming bearer tokens
     */
    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);

        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(BEARER_PREFIX.length());
        Optional<JwtPrincipal> principal = jwtService.validate(token);

        if (principal.isEmpty()) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(
                    "{\"error\":\"INVALID_TOKEN\",\"message\":\"Invalid or expired token.\"}");
            return;
        }

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal.get(), null, List.of()));

        filterChain.doFilter(request, response);
    }
}
