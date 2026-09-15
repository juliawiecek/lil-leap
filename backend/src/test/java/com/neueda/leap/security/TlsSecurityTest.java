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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.boot.web.embedded.tomcat.TomcatWebServer;
import org.springframework.boot.logging.LoggingInitializationContext;
import org.springframework.boot.logging.LogFile;
import org.springframework.boot.logging.logback.LogbackLoggingSystem;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManagerFactory;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Real embedded Tomcat TLS with the shipped application.yml and logging configuration. */
@SpringBootTest(classes = TlsSecurityTest.TestApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "logging.file.name=target/tls-security-test.log")
@ActiveProfiles("file-logging")
@ExtendWith(OutputCaptureExtension.class)
class TlsSecurityTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, UserDetailsServiceAutoConfiguration.class})
    @Import({SecurityConfig.class, JwtServiceImpl.class, AuthController.class, UserController.class, GlobalExceptionHandler.class})
    static class TestApplication { }

    private static final String TEST_PASSWORD = "test-certificate-only";
    private static Path keystore;
    private static final Path logFile = Path.of("target/tls-security-test.log");
    @LocalServerPort int port;
    @MockBean UserService users;
    @Autowired ServletWebServerApplicationContext context;

    @BeforeAll
    static void initializeFileLogging(@Autowired ConfigurableEnvironment environment) {
        // Other MVC test contexts may have initialized the JVM-wide logging system first.
        // Reload the shipped config using this context's file-logging profile and log path.
        var logging = new LogbackLoggingSystem(TlsSecurityTest.class.getClassLoader());
        logging.cleanUp();
        logging.initialize(new LoggingInitializationContext(environment), "classpath:logback-spring.xml", LogFile.get(environment));
    }

    @DynamicPropertySource
    static void certificate(DynamicPropertyRegistry properties) throws Exception {
        Path directory = Files.createTempDirectory("nexttrade-tls-test-");
        keystore = directory.resolve("test.p12");
        directory.toFile().deleteOnExit();
        keystore.toFile().deleteOnExit();
        String executable = System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool";
        Process process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", executable).toString(),
                "-genkeypair", "-alias", "test", "-keyalg", "RSA", "-keysize", "2048", "-validity", "1",
                "-dname", "CN=localhost", "-ext", "SAN=dns:localhost", "-storetype", "PKCS12",
                "-keystore", keystore.toString(), "-storepass", TEST_PASSWORD, "-noprompt")
                .redirectErrorStream(true).start();
        String result = new String(process.getInputStream().readAllBytes());
        if (process.waitFor() != 0) throw new IllegalStateException("Test certificate generation failed: " + result);
        properties.add("server.ssl.key-store", () -> keystore.toUri().toString());
        properties.add("server.ssl.key-store-password", () -> TEST_PASSWORD);
    }

    private HttpClient client(String protocol) throws Exception {
        KeyStore trustStore = KeyStore.getInstance("PKCS12");
        try (var input = Files.newInputStream(keystore)) {
            trustStore.load(input, TEST_PASSWORD.toCharArray());
        }
        TrustManagerFactory trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trust.init(trustStore);
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, trust.getTrustManagers(), null);
        SSLParameters parameters = new SSLParameters();
        parameters.setProtocols(new String[]{protocol});
        return HttpClient.newBuilder().sslContext(context).sslParameters(parameters)
                .connectTimeout(Duration.ofSeconds(5)).build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"TLSv1.2", "TLSv1.3"})
    void loginAndAuthenticatedRequestsWorkOverSupportedTls(String protocol, CapturedOutput output) throws Exception {
        UUID id = UUID.randomUUID();
        UserResponse user = new UserResponse(id, "Test", "Client", "client@example.com", null, false, Instant.now(), Instant.now());
        when(users.login(any())).thenReturn(user);
        when(users.getById(id)).thenReturn(user);
        try (HttpClient client = client(protocol)) {
            HttpResponse<String> login = client.send(HttpRequest.newBuilder(URI.create("https://localhost:" + port + "/api/v1/auth/login"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"client@example.com\",\"password\":\"tls-login-canary\"}"))
                    .build(), HttpResponse.BodyHandlers.ofString());
            assertThat(login.statusCode()).isEqualTo(200);
            assertThat(login.sslSession().orElseThrow().getProtocol()).isEqualTo(protocol);
            assertThat(login.headers().firstValue("Strict-Transport-Security")).isPresent();
            assertThat(login.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
            String token = new ObjectMapper().readTree(login.body()).get("token").asText();
            HttpResponse<String> me = client.send(HttpRequest.newBuilder(URI.create("https://localhost:" + port + "/api/v1/users/me"))
                    .header("Authorization", "Bearer " + token).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(me.statusCode()).isEqualTo(200);
            assertThat(me.body()).contains(id.toString());
            assertThat(output.getAll()).doesNotContain(token, "tls-login-canary");
            assertThat(Files.readString(logFile)).doesNotContain(token, "tls-login-canary");
        }
    }

    @Test
    void connectorEnablesOnlyModernTlsProtocols() {
        TomcatWebServer server = (TomcatWebServer) context.getWebServer();
        var hosts = server.getTomcat().getConnector().findSslHostConfigs();
        assertThat(hosts).isNotEmpty();
        for (var host : hosts) {
            assertThat(host.getEnabledProtocols()).containsExactlyInAnyOrder("TLSv1.2", "TLSv1.3");
        }
    }

    @Test
    void plaintextCannotReachAuthenticationOnTlsPort(CapturedOutput output) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<String> response = client.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/auth/login"))
                    .header("X-Forwarded-Proto", "https")
                    .header("Authorization", "Bearer plaintext-token-canary")
                    .POST(HttpRequest.BodyPublishers.ofString("{\"password\":\"plaintext-password-canary\"}"))
                    .build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(400);
            verifyNoInteractions(users);
            assertThat(output.getAll()).doesNotContain("plaintext-token-canary", "plaintext-password-canary");
            assertThat(Files.readString(logFile)).doesNotContain("plaintext-token-canary", "plaintext-password-canary");
        }
    }

    @Test
    void actualConsoleAndFileAppendersMaskMessagesAndExceptions(CapturedOutput output) throws Exception {
        LoggerFactory.getLogger(TlsSecurityTest.class).warn("masking-check password=message-canary",
                new IllegalArgumentException("token=exception-canary"));
        for (String rendered : new String[]{output.getAll(), Files.readString(logFile)}) {
            assertThat(rendered).contains("masking-check", "[REDACTED]", "IllegalArgumentException")
                    .doesNotContain("message-canary", "exception-canary", "%nopex", "%PARSER_ERROR");
        }
    }
}
