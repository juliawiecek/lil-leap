# Orders (Spring Boot) — Local Development

## Prerequisites
- PostgreSQL 16 running on localhost:5432
- Database bootstrapped via `db/setup-local.sql`
- Java 17+ and Maven installed
- Optional: Kafka broker on `localhost:9092` if you want terminal order events to publish to Kafka

## Run
```cmd
cd nextTrade-orders
mvn spring-boot:run '-Dspring.profiles.active=local'
```

The `application-local.yml` profile in `src/main/resources/application-local.yml` provides all local configuration values (database connection, port 8082, JWT secret).
It also defaults Kafka bootstrap servers to `localhost:9092` so the service can publish terminal order events to a locally started broker.

## Verify
- Swagger: `http://localhost:8082/api/v1/swagger-ui.html`
- API docs: `http://localhost:8082/api/v1/v3/api-docs`
- Health: `http://localhost:8082/api/v1/actuator/health` (if enabled)




