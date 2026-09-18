package com.neueda.leap.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.user.AuthController;
import com.neueda.leap.user.UserController;
import com.neueda.leap.user.UserService;
import com.neueda.leap.user.dto.UserResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.logging.LoggingInitializationContext;
import org.springframework.boot.logging.LogFile;
import org.springframework.boot.logging.logback.LogbackLoggingSystem;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** Real embedded Tomcat HTTP with the shipped application.yml and logging configuration. */
@SpringBootTest(classes = HttpSecurityTest.TestApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "logging.file.name=target/http-security-test.log")
@ActiveProfiles("file-logging")
@ExtendWith(OutputCaptureExtension.class)
class HttpSecurityTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, UserDetailsServiceAutoConfiguration.class})
    @Import({SecurityConfig.class, JwtServiceImpl.class, AuthController.class, UserController.class, GlobalExceptionHandler.class})
    static class TestApplication { }

    private static final Path logFile = Path.of("target/http-security-test.log");
    @LocalServerPort int port;
    @MockBean UserService users;

    @BeforeAll
    static void initializeFileLogging(@Autowired ConfigurableEnvironment environment) {
        // Other MVC test contexts may have initialized the JVM-wide logging system first.
        // Reload the shipped config using this context's file-logging profile and log path.
        var logging = new LogbackLoggingSystem(HttpSecurityTest.class.getClassLoader());
        logging.cleanUp();
        logging.initialize(new LoggingInitializationContext(environment), "classpath:logback-spring.xml", LogFile.get(environment));
    }

    @Test
    void loginAndAuthenticatedRequestsWorkOverHttp(CapturedOutput output) throws Exception {
        UUID id = UUID.randomUUID();
        UserResponse user = new UserResponse(id, "Test", "Client", "client@example.com", null, false, Instant.now(), Instant.now());
        when(users.login(any())).thenReturn(user);
        when(users.getById(id)).thenReturn(user);
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<String> login = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/auth/login"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"client@example.com\",\"password\":\"http-login-canary\"}"))
                    .build(), HttpResponse.BodyHandlers.ofString());
            assertThat(login.statusCode()).isEqualTo(200);
            assertThat(login.headers().firstValue("Strict-Transport-Security")).isEmpty();
            assertThat(login.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
            String token = new ObjectMapper().readTree(login.body()).get("token").asText();
            HttpResponse<String> me = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/users/me"))
                    .header("Authorization", "Bearer " + token).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(me.statusCode()).isEqualTo(200);
            assertThat(me.body()).contains(id.toString());
            assertThat(output.getAll()).doesNotContain(token, "http-login-canary");
            assertThat(Files.readString(logFile)).doesNotContain(token, "http-login-canary");
        }
    }

    @Test
    void actualConsoleAndFileAppendersMaskMessagesAndExceptions(CapturedOutput output) throws Exception {
        LoggerFactory.getLogger(HttpSecurityTest.class).warn("masking-check password=message-canary",
                new IllegalArgumentException("token=exception-canary"));
        for (String rendered : new String[]{output.getAll(), Files.readString(logFile)}) {
            assertThat(rendered).contains("masking-check", "[REDACTED]", "IllegalArgumentException")
                    .doesNotContain("message-canary", "exception-canary", "%nopex", "%PARSER_ERROR");
        }
    }
}
