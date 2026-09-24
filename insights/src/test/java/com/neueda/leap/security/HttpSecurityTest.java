package com.neueda.leap.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.neueda.leap.common.exception.GlobalExceptionHandler;
import com.neueda.leap.config.SecurityConfig;
import com.neueda.leap.portfolio.controller.ClientFinancialController;
import com.neueda.leap.portfolio.service.ClientFinancialQueryService;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.logging.LogFile;
import org.springframework.boot.logging.LoggingInitializationContext;
import org.springframework.boot.logging.logback.LogbackLoggingSystem;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/** Real embedded Tomcat HTTP with the shipped application.yml and logging configuration. */
@SpringBootTest(classes = HttpSecurityTest.TestApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "logging.file.name=target/http-security-test.log")
@ActiveProfiles("file-logging")
@ExtendWith(OutputCaptureExtension.class)
class HttpSecurityTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {HibernateJpaAutoConfiguration.class, JpaRepositoriesAutoConfiguration.class,
            DataSourceAutoConfiguration.class, UserDetailsServiceAutoConfiguration.class})
    @Import({SecurityConfig.class, JwtServiceImpl.class, ClientFinancialController.class, GlobalExceptionHandler.class})
    static class TestApplication { }

    private static final Path logFile = Path.of("target/http-security-test.log");
    @LocalServerPort int port;
    @Autowired JwtService tokens;
    @MockBean ClientFinancialQueryService queryService;

    @BeforeAll
    static void initializeFileLogging(@Autowired ConfigurableEnvironment environment) {
        var logging = new LogbackLoggingSystem(HttpSecurityTest.class.getClassLoader());
        logging.cleanUp();
        logging.initialize(new LoggingInitializationContext(environment), "classpath:logback-spring.xml", LogFile.get(environment));
    }

    @Test
    void tokenMintedByJwtServiceCanAccessProtectedHoldingsRoute(CapturedOutput output) throws Exception {
        UUID id = UUID.randomUUID();
        when(queryService.getHoldings(id)).thenReturn(List.of());
        String token = tokens.issueToken(id, "client@example.com");
        HttpClient client = HttpClient.newHttpClient();

        HttpResponse<String> holdings = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/holdings"))
                .header("Authorization", "Bearer " + token).build(), HttpResponse.BodyHandlers.ofString());

        assertThat(holdings.statusCode()).isEqualTo(200);
        assertThat(new ObjectMapper().readTree(holdings.body()).isArray()).isTrue();
        assertThat(output.getAll()).doesNotContain(token);
        assertThat(Files.readString(logFile)).doesNotContain(token);
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
