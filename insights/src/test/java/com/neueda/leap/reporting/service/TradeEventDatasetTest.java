package com.neueda.leap.reporting.service;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TradeEventDatasetTest {

    private static final String HEADER = "order_id,occurred_at,source,type,actor,details\n";
    private static final String ORDER = "f0000000-0000-4000-8000-000000000012";

    private static TradeEventDataset dataset(String csv) {
        ResourceLoader loader = mock(ResourceLoader.class);
        when(loader.getResource("classpath:reports/trade-events.csv"))
                .thenAnswer(ignored -> new ByteArrayResource(csv.getBytes(StandardCharsets.UTF_8)));
        return new TradeEventDataset(loader);
    }

    @Test
    void theCommittedDatasetHasEightStepsForEverySeededFill() {
        var events = new TradeEventDataset(new DefaultResourceLoader()).events(ORDER);

        assertThat(events).extracting(TradeEventDataset.Event::source)
                .containsExactly("STATUS", "STATUS", "STATUS", "AUDIT", "AUDIT", "FILL", "CASH", "HOLDING");
        assertThat(events.get(6).details()).containsEntry("amount", "-2426.48").containsEntry("currency", "USD");
    }

    @Test
    void readsOnlyTheOrdersRowsIgnoringCaseAndEmptyFields() {
        var events = dataset(HEADER
                + ORDER.toUpperCase() + ",2026-10-05T18:04:34Z,STATUS,SUBMITTED,,\n"
                + ORDER + "9,2026-10-05T18:04:35Z,STATUS,SUBMITTED,,\n").events(ORDER);

        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.actor()).isNull();
            assertThat(event.details()).isEqualTo(Map.of());
        });
    }

    @Test
    void malformedDatasetsFailClearly() throws IOException {
        assertThatThrownBy(() -> dataset("").events(ORDER)).hasMessageContaining("header");
        assertThatThrownBy(() -> dataset("wrong,header\n").events(ORDER)).hasMessageContaining("header");
        assertThatThrownBy(() -> dataset(HEADER + ORDER + ",missing\n").events(ORDER)).hasMessageContaining("column count");
        assertThatThrownBy(() -> dataset(HEADER + ORDER + ",2026-10-05T18:04:34Z,STATUS,SUBMITTED,,{bad\n").events(ORDER))
                .hasMessageContaining("Unreadable details");

        ResourceLoader loader = mock(ResourceLoader.class);
        Resource resource = mock(Resource.class);
        when(loader.getResource(any())).thenReturn(resource);
        var broken = new TradeEventDataset(loader);
        assertThatThrownBy(() -> broken.events(ORDER)).hasMessageContaining("not found");
        when(resource.exists()).thenReturn(true);
        when(resource.getInputStream()).thenThrow(new IOException("read failure"));
        assertThatThrownBy(() -> broken.events(ORDER)).hasCauseInstanceOf(IOException.class);
    }
}
