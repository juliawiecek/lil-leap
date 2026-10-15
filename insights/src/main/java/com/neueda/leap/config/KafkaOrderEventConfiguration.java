package com.neueda.leap.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;

/** Configures Kafka listener infrastructure for the Insights application. */
@Configuration
@EnableKafka
public class KafkaOrderEventConfiguration {

    /** Creates the Kafka configuration; Spring instantiates it. */
    public KafkaOrderEventConfiguration() {
        // No state to initialize.
    }

    /**
     * Creates the Kafka listener factory used by the three Insights consumers.
     *
     * @param consumerFactory consumer factory configured from the Spring Kafka properties
     * @return the listener container factory
     */
    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory(
            ConsumerFactory<String, String> consumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        return factory;
    }
}

