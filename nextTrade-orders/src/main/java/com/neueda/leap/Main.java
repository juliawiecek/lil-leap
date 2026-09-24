package com.neueda.leap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point for the Lil Leap NextTrade Insights backend application.
 *
 * <p>This class bootstraps the Spring Boot application context and starts
 * the backend services.</p>
 */
@SpringBootApplication
@EnableScheduling
public class Main {

    /**
     * Starts the Spring Boot application.
     *
     * @param args command-line arguments passed to the application
     */
    public static void main(String[] args) {
        SpringApplication.run(Main.class, args);
    }
}
