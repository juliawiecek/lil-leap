package com.neueda.leap.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Configuration class for application security-related beans.
 *
 * <p>Currently provides a password encoder bean used to securely hash
 * user passwords before they are stored.</p>
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
}