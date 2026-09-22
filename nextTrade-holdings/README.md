# Lil Leap NextTrade Holdings Backend

Spring Boot service for the NextTrade holdings backend, including user onboarding and authentication.

## Package Layout

```text
com.neueda.leap
|- Main.java
|- common.exception      # Cross-cutting exception handlers
|- config                # Application configuration
|- onboarding            # Registration API, DTOs, onboarding entities and service
|- order                 # Example order model and validation service
`- user                  # Authentication entity, repository, and auth exceptions
```

## Main Domains

- `onboarding`: Handles registration requests and persists profile/financial/account data.
- `user`: Stores authentication-focused user data (email, password hash, lock metadata).
- `order`: Contains a simple order model and validation logic.

## Local Development

Requirements:
- Java 21
- Maven 3.9+

Run tests:

```bash
mvn clean test
```

Run the application:

```bash
mvn spring-boot:run
```

Build a jar:

```bash
mvn clean package
```

## API

Registration endpoint:
- `POST /api/v1/users`

The request body is defined in `com.neueda.leap.onboarding.dto.RegisterUserRequest`.
The response body is defined in `com.neueda.leap.onboarding.dto.UserResponse`.

