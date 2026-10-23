package com.neueda.leap.security;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class AuthSessionClientTest {
    @Test
    void checksEveryRequestAndFailsClosedWithoutCachingOrRedirects() throws Exception {
        var status = new AtomicInteger(204);
        var authorization = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/auth/me/session", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.getResponseHeaders().set("Location", "/elsewhere");
            exchange.sendResponseHeaders(status.get(), -1);
            exchange.close();
        });
        server.start();
        var client = new AuthSessionClient("http://127.0.0.1:" + server.getAddress().getPort() + "/auth/me/session");
        try {
            assertTrue(client.test("signed-token"));
            assertEquals("Bearer signed-token", authorization.get());
            for (int failure : new int[] {401, 403, 500, 302, 200}) {
                status.set(failure);
                assertFalse(client.test("signed-token"));
            }
        } finally { server.stop(0); }
        assertFalse(client.test("signed-token"));
    }
}
