package com.neueda.leap.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI 3.0 / Swagger configuration for the Identity Service.
 * 
 * Configures API documentation including title, version, contact info, and license.
 * The Swagger UI is available at /api/v1/swagger-ui.html
 */
@Configuration
public class OpenApiConfig {

    /**
     * Configures the OpenAPI specification for the NextTrade Identity Service.
     *
     * @return an OpenAPI object containing API information and metadata
     */
    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("NextTrade Identity Service API")
                        .version("1.0.0")
                        .description(
                                "OpenAPI specification for the NextTrade Identity Service. " +
                                "This API provides authentication, registration, and password management endpoints " +
                                "for the NextTrade e-trading platform.\n\n" +
                                "## Authentication\n" +
                                "After successful login or registration, use the returned JWT token in the Authorization header:\n" +
                                "`Authorization: Bearer <token>`\n\n" +
                                "## Endpoints\n" +
                                "- **Registration**: `POST /users` - Create a new user account with investor onboarding details\n" +
                                "- **Login**: `POST /auth/login` - Authenticate and receive JWT session token\n" +
                                "- **Password Reset**: `POST /auth/password-reset/request` - Request password reset via email\n" +
                                "- **Password Reset Confirm**: `POST /auth/password-reset/confirm` - Complete password reset with token\n\n" +
                                "## Security\n" +
                                "- Passwords are hashed using bcrypt with salt rounds\n" +
                                "- Invalid credentials return generic 401 responses (no email enumeration)\n" +
                                "- Password reset tokens are single-use and time-limited\n" +
                                "- All endpoints require HTTPS (TLS 1.2+)"
                        )
                        .contact(new Contact()
                                .name("NextTrade Team (Lil Leap)")
                                .email("team@nexttrade.dev")
                                .url("https://github.com/lil-leap/nexttrade")
                        )
                        .license(new License()
                                .name("Apache 2.0")
                                .url("https://www.apache.org/licenses/LICENSE-2.0.html")
                        )
                );
    }
}
