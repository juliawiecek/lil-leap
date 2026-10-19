package com.neueda.leap.order.execution.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class KafkaOrderLifecycleEventPublisherTest {
    @Test
    void disabledPublisherDoesNotQueryTheDatabaseOrContactKafka() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, String> kafka = mock(KafkaTemplate.class);
        ObjectMapper mapper = mock(ObjectMapper.class);
        var publisher = new KafkaOrderLifecycleEventPublisher(jdbc, kafka, mapper, "order-events", false);

        publisher.publishTerminalEvent(UUID.randomUUID());

        verifyNoInteractions(jdbc, kafka, mapper);
    }
}
