package com.neueda.leap.marketdata.generation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Turns on scheduling for {@link QuoteGenerationJob} only when the generator is enabled. */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "marketdata.quotes.generator.enabled", havingValue = "true", matchIfMissing = true)
public class QuoteGenerationConfiguration {

    /** Creates the configuration; Spring instantiates it. */
    public QuoteGenerationConfiguration() {
        // No state to initialize.
    }
}
