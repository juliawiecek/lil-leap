package com.neueda.leap.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration class for the OpenAPI/Swagger documentation exposed by the API.
 *
 * <p>Registers a bearer JWT security scheme so that authenticated endpoints can
 * be exercised directly from the Swagger UI using a token obtained from
 * {@code POST /auth/login}.</p>
 */
@Configuration
public class OpenApiConfig {

    /**
     * Name used to reference the bearer JWT security scheme from operations
     * and to label it in the Swagger UI's "Authorize" dialog.
     */
    private static final String BEARER_AUTH_SCHEME = "bearerAuth";

    /**
     * Builds the {@link OpenAPI} definition used to generate API documentation.
     *
     * @return the configured OpenAPI definition, including API metadata and
     *         the bearer JWT security scheme
     */
    @Bean
    public OpenAPI leapOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Lil Leap API")
                        .description("API for registering, authenticating, and managing trading accounts.")
                        .version("v1"))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_AUTH_SCHEME))
                .components(new Components()
                        .addSecuritySchemes(BEARER_AUTH_SCHEME, new SecurityScheme()
                                .name(BEARER_AUTH_SCHEME)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
