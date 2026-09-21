package com.neueda.leap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

/**
 * Entry point for the NextTrade backend application.
 *
 * <p>This class bootstraps the Spring Boot application context and starts
 * the backend services.</p>
 */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class Main {

    /** Creates the application configuration instantiated by Spring Boot. */
    public Main() {
    }

    /**
     * Starts the Spring Boot application.
     *
     * @param args command-line arguments passed to the application
     */
    public static void main(String[] args) {
        SpringApplication.run(Main.class, args);
    }
}
