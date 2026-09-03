package com.neueda.leap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Provides the entry point for the NextTrade Spring Boot application.
 *
 * <p>Starting this class initializes the Spring application context
 * and starts the embedded web server.</p>
 */
@SpringBootApplication
public class Main {

    /**
     * Starts the NextTrade backend application.
     *
     * @param args command-line arguments supplied at startup
     */
    public static void main(String[] args) throws InterruptedException {
        SpringApplication.run(Main.class, args);

        System.out.println("Container is up. Sleeping so you can docker ps / docker logs / docker exec into it.");
        //Thread.sleep(600_000);
    }
}
