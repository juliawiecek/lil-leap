# Insights (Spring Boot) — Local Development

## Prerequisites
- Java 17+ and Maven installed
- (Database not currently used; reports generated from local CSV data)
- Optional: Kafka broker on `localhost:9092` if you want the order-event CSV writers to run

## Run
```cmd
cd insights
mvn spring-boot:run '-Dspring.profiles.active=local'
```

The `application-local.yml` profile in `src/main/resources/application-local.yml` provides all local configuration values (port 8084, JWT secret, SSN encryption key).
It also defaults Kafka bootstrap servers to `localhost:9092` so the Kafka listeners can consume a locally started broker.

## Verify
- Swagger: `http://localhost:8084/api/v1/swagger-ui.html`
- API docs: `http://localhost:8084/api/v1/v3/api-docs`
- Health: `http://localhost:8084/api/v1/actuator/health` (if enabled)




