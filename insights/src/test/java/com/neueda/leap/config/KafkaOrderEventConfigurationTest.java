package com.neueda.leap.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class KafkaOrderEventConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(KafkaOrderEventConfiguration.class)
            .withBean(ConsumerFactory.class, () -> mock(ConsumerFactory.class));

    @Test
    void listenerStartupCanBeDisabledForStacksWithoutKafka() {
        contextRunner.withPropertyValues("spring.kafka.listener.auto-startup=false").run(context -> {
            var factory = context.getBean(ConcurrentKafkaListenerContainerFactory.class);
            assertThat(factory.createContainer("order-events").isAutoStartup()).isFalse();
        });
    }

    @Test
    void listenersStillStartByDefault() {
        contextRunner.run(context -> {
            var factory = context.getBean(ConcurrentKafkaListenerContainerFactory.class);
            assertThat(factory.createContainer("order-events").isAutoStartup()).isTrue();
        });
    }
}
