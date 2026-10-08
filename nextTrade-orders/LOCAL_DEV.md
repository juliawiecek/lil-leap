# Orders (Spring Boot) — Local Development

## Prerequisites
- PostgreSQL 16 running on localhost:5432
- Database bootstrapped via `db/setup-local.sql`
- Java 17+ and Maven installed

## Run
```cmd
cd nextTrade-orders
mvn spring-boot:run '-Dspring.profiles.active=local'
```

The `application-local.yml` profile in `src/main/resources/application-local.yml` provides all local configuration values (database connection, port 8082, JWT secret).

## Verify
- Swagger: `http://localhost:8082/api/v1/swagger-ui.html`
- API docs: `http://localhost:8082/api/v1/v3/api-docs`
- Health: `http://localhost:8082/api/v1/actuator/health` (if enabled)




