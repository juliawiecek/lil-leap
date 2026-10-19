package com.neueda.leap.config;

import com.neueda.leap.security.JwtAuthenticationFilter;
import com.neueda.leap.security.JwtService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationManagers;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.util.matcher.RegexRequestMatcher;

/** Verifies Identity-issued JWTs and exposes only this service's API. */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    /** {@code /orders/{uuid}} and {@code /orders/{uuid}/status}, with no query string. */
    private static final String ORDER_READ_PATH =
            "^/orders/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(/status)?$";

    /** Creates the security configuration; Spring instantiates it. */
    public SecurityConfig() {
        // No state to initialize.
    }

    /**
     * Restricts access to the service's explicit routes.
     * @param http Spring Security builder
     * @param tokens JWT verifier
     * @return stateless API security chain
     * @throws Exception when the chain cannot be built
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtService tokens) throws Exception {
        // Stateless bearer-token API with no cookies or session, so CSRF does not apply; the
        // browser client sends no CSRF token and enabling it rejects every POST /orders.
        return http.csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable).httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable).requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(h -> h.frameOptions(f -> f.deny())
                        .contentSecurityPolicy(c -> c.policyDirectives("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"))
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.GET, "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs", "/v3/api-docs/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/settlements/recover", "/settlements/rollback").hasRole("OPERATIONS")
                        .requestMatchers(HttpMethod.GET, "/settlements/status/**").hasRole("OPERATIONS")
                        .requestMatchers(HttpMethod.POST, "/orders").access(traderWithoutParameters())
                        // UUID ids only, so sibling routes such as /orders/quote-preview are matched separately.
                        .requestMatchers(RegexRequestMatcher.regexMatcher(HttpMethod.GET, ORDER_READ_PATH))
                            .access(traderWithoutParameters())
                        .requestMatchers(HttpMethod.GET, "/orders/quote-preview").hasRole("TRADER")
                        // Market open/closed is not account data: any signed-in user may read it.
                        .requestMatchers(HttpMethod.GET, "/market/status").authenticated()
                        .anyRequest().denyAll())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((request, response, failure) -> {
                            response.setStatus(401);
                            response.setContentType("application/json");
                            response.getWriter().write("{\"error\":\"UNAUTHENTICATED\",\"message\":\"Authentication is required.\"}");
                        })
                        .accessDeniedHandler((request, response, failure) -> {
                            response.setStatus(403);
                            response.setContentType("application/json");
                            response.getWriter().write("{\"error\":\"ACCESS_DENIED\",\"message\":\"Access is denied.\"}");
                        }))
                .addFilterBefore(new JwtAuthenticationFilter(tokens), UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /** Traders only, and no query or form parameters that could look like a scope override. */
    private static AuthorizationManager<RequestAuthorizationContext> traderWithoutParameters() {
        return AuthorizationManagers.allOf(
                AuthorityAuthorizationManager.hasRole("TRADER"),
                (authentication, context) -> new AuthorizationDecision(
                        context.getRequest().getQueryString() == null
                                && context.getRequest().getParameterMap().isEmpty()));
    }
}
