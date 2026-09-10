package com.neueda.leap.config;

import com.neueda.leap.security.JwtAuthenticationFilter;
import com.neueda.leap.security.JwtService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

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
     * @param http the {@link HttpSecurity} builder to configure
     * @param jwtService the service used to validate incoming bearer tokens
     * @return the configured {@link SecurityFilterChain}
     * @throws Exception if the security configuration cannot be built
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtService jwtService) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/users", "/auth/login").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(new JwtAuthenticationFilter(jwtService), UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}