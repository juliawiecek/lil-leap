package com.neueda.leap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the Lil Leap backend application.
 *
 * <p>This class bootstraps the Spring Boot application context and starts
 * the backend services.</p>
 */
@SpringBootApplication
public class Main {

    /**
     * Starts the Spring Boot application.
     *
     * @param args command-line arguments passed to the application
     * @throws InterruptedException declared by the method signature; currently not used
     */
    public static void main(String[] args) throws InterruptedException {
        SpringApplication.run(Main.class, args);

        System.out.println("Container is up. Sleeping so you can docker ps / docker logs / docker exec into it.");
        //Thread.sleep(600_000);
    }
}
