package com.neueda.leap.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI metadata for the generated spec and Swagger UI.
 *
 * <p>Declares the bearer-JWT security scheme so Swagger UI's "Authorize"
 * button can attach a token to requests against protected endpoints; the
 * scheme is descriptive only and does not itself enforce anything - actual
 * enforcement is {@link SecurityConfig}'s job.</p>
 */
@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "bearerAuth";

    /** Creates the OpenAPI metadata configuration. */
    public OpenApiConfig() {
    }

    /**
     * Builds the OpenAPI document's info block and bearer-auth security scheme.
     *
     * @return the configured {@link OpenAPI} bean picked up by springdoc
     */
    @Bean
    public OpenAPI nextTradeOrdersOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("NextTrade Orders API")
                        .description("Validated, idempotent order submission. "
                                + "Also runs the scheduled fill-or-reject execution engine (not exposed over HTTP).")
                        .version("v1"))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME, new SecurityScheme()
                                .name(BEARER_SCHEME)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
