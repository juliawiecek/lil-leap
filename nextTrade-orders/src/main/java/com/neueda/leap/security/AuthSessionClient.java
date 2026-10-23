package com.neueda.leap.security;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.function.Predicate;

/** Live authorization check against Identity's primary session store; deliberately never cached. */
public class AuthSessionClient implements Predicate<String> {
    private final URI endpoint;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();

    public AuthSessionClient(String endpoint) {
        this.endpoint = URI.create(endpoint);
    }

    @Override
    public boolean test(String token) {
        try {
            var request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(2))
                    .header("Authorization", "Bearer " + token).GET().build();
            return client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 204;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        } catch (java.io.IOException | RuntimeException exception) {
            // No token, response body or transport details in logs. An unavailable authority denies access.
            return false;
        }
    }
}
