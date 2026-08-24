package com.neueda.leap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Main {
    public static void main(String[] args) throws InterruptedException {
        SpringApplication.run(Main.class, args);

        System.out.println("Container is up. Sleeping so you can docker ps / docker logs / docker exec into it.");
        //Thread.sleep(600_000);
    }
}
