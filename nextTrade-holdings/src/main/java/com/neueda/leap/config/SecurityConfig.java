package com.neueda.leap.config;

import com.neueda.leap.security.JwtAuthenticationFilter;
import com.neueda.leap.security.JwtService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

/** Verifies Identity-issued JWTs and exposes only this service's API. */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    private static final String API_PREFIX = "/api/v1";

    private static final String[] DOC_ROUTES = {
            "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs", "/v3/api-docs/**",
            API_PREFIX + "/swagger-ui.html", API_PREFIX + "/swagger-ui/**", API_PREFIX + "/v3/api-docs",
            API_PREFIX + "/v3/api-docs/**"
    };

    private static final String[] TRADER_ORDER_ROUTES = {
            "/clients/*/orders", API_PREFIX + "/clients/*/orders"
    };

    private static final String[] PORTFOLIO_READ_ROUTES = {
            "/clients/*/portfolio-summary", "/accounts", "/holdings", "/holdings/**", "/cash", "/orders",
            "/instruments", "/instruments/*", "/clients/*/holdings", "/clients/*/cash", "/cash/balance/*",
            "/quotes/latest/by-instrument/*", "/quotes/latest/by-market-symbol", "/quotes/history/*", "/quotes/candles/*",
            API_PREFIX + "/clients/*/portfolio-summary", API_PREFIX + "/accounts", API_PREFIX + "/holdings",
            API_PREFIX + "/holdings/**", API_PREFIX + "/cash", API_PREFIX + "/orders", API_PREFIX + "/instruments",
            API_PREFIX + "/instruments/*", API_PREFIX + "/clients/*/holdings", API_PREFIX + "/clients/*/cash",
            API_PREFIX + "/cash/balance/*", API_PREFIX + "/quotes/latest/by-instrument/*",
            API_PREFIX + "/quotes/latest/by-market-symbol", API_PREFIX + "/quotes/history/*",
            API_PREFIX + "/quotes/candles/*"
    };

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
        // Supported API routes are read-only GETs; keep CSRF protection enabled for unsafe methods.
        return http.csrf(Customizer.withDefaults())
                .formLogin(AbstractHttpConfigurer::disable).httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable).requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(h -> h.frameOptions(f -> f.deny())
                        .contentSecurityPolicy(c -> c.policyDirectives("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"))
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.GET, DOC_ROUTES).permitAll()
                        .requestMatchers(HttpMethod.GET, TRADER_ORDER_ROUTES).hasRole("TRADER")
                        .requestMatchers(HttpMethod.GET, PORTFOLIO_READ_ROUTES).hasAnyRole("TRADER", "ANALYST")
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
}
