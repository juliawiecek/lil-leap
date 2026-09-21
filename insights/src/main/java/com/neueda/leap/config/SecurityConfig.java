package com.neueda.leap.config;

import com.neueda.leap.security.JwtAuthenticationFilter;
import com.neueda.leap.security.JwtService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authorization.AuthenticatedAuthorizationManager;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManagers;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

/**
 * Configuration class for application security-related beans.
 *
 * <p>Provides the password encoder used to securely hash user passwords,
 * and the HTTP security filter chain that enforces stateless JWT-based
 * authentication on every route except registration and login.</p>
 */
@Configuration
public class SecurityConfig {

    /**
     * Creates and returns a delegating password encoder.
     *
     * <p>The delegating password encoder supports multiple encoding formats
     * and uses a default secure encoding algorithm.</p>
     *
     * @return a configured {@link PasswordEncoder} instance
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /**
     * Configures the HTTP security filter chain.
     *
     * <p>Sessions are stateless (auth state lives entirely in the JWT), CSRF
     * protection is disabled since there are no cookie-based sessions to
     * protect, registration and login are open to anonymous callers, and the
     * {@link JwtAuthenticationFilter} runs ahead of Spring's own username/password
     * filter so a valid bearer token is recognized before any other authentication
     * mechanism is considered.</p>
     *
     * <p>The authentication entry point is set explicitly to always return 401:
     * without it, Spring Security's default for an app with no login form or
     * HTTP Basic configured is a 403, which is the wrong signal for a missing
     * or absent bearer token on a token-only API (403 means "authenticated but
     * not allowed"; 401 means "not authenticated at all", which is what a
     * missing token actually is).</p>
     *
     * @param http the {@link HttpSecurity} builder to configure
     * @param jwtService the service used to validate incoming bearer tokens
     * @return the configured {@link SecurityFilterChain}
     * @throws Exception if the security configuration cannot be built
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtService jwtService) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .headers(headers -> headers
                        .httpStrictTransportSecurity(hsts -> hsts.maxAgeInSeconds(31536000).includeSubDomains(true))
                        .frameOptions(frame -> frame.deny())
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'; base-uri 'none'"))
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .permissionsPolicy(permissions -> permissions.policy("camera=(), microphone=(), geolocation=()")))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                    "/users",
                                "/auth/login",
                                "/auth/password-reset/**"
                        ).permitAll()
                        // These collections accept no caller-selected scope. Identity comes from JWT.
                        .requestMatchers(HttpMethod.GET, "/holdings", "/cash", "/orders")
                        .access(AuthorizationManagers.allOf(
                                AuthenticatedAuthorizationManager.authenticated(),
                                (authentication, context) -> new AuthorizationDecision(
                                        context.getRequest().getParameterMap().isEmpty())))
                        // Submission authorizes the body account against the JWT in the service.
                        .requestMatchers(HttpMethod.POST, "/orders")
                        .access(AuthorizationManagers.allOf(
                                AuthenticatedAuthorizationManager.authenticated(),
                                (authentication, context) -> new AuthorizationDecision(
                                        context.getRequest().getParameterMap().isEmpty())))
                        // Other financial writes and object-ID routes are not implemented yet.
                        .requestMatchers("/holdings", "/holdings/**", "/cash", "/cash/**", "/orders", "/orders/**")
                        .denyAll()
                        .anyRequest().authenticated())
                .exceptionHandling(exceptionHandling -> exceptionHandling
                        .accessDeniedHandler((request, response, exception) -> {
                            response.setStatus(HttpStatus.FORBIDDEN.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.getWriter().write(
                                    "{\"error\":\"ACCESS_DENIED\",\"message\":\"Access is denied.\"}");
                        })
                        .authenticationEntryPoint(
                        (request, response, authException) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.getWriter().write(
                                    "{\"error\":\"UNAUTHENTICATED\",\"message\":\"Authentication is required.\"}");
                        }))
                .addFilterBefore(new JwtAuthenticationFilter(jwtService), UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
