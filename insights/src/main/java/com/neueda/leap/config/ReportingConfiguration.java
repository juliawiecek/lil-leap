package com.neueda.leap.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/** Provides infrastructure beans used by the reporting service. */
@Configuration
public class ReportingConfiguration {

    /** Creates the reporting configuration; Spring instantiates it. */
    public ReportingConfiguration() {
        // No state to initialize.
    }


    /** Returns the UTC clock used by reporting date-window calculations. */
    @Bean
    Clock reportingClock() {
        return Clock.systemUTC();
    }
}

