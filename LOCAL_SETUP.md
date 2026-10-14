# Local Development (No Docker)

Run each service independently from its own directory. Use the service-specific guides below for the startup command and local URLs.

## Database

1. Install PostgreSQL 16 on `localhost:5432`.
2. Run the bootstrap script from the repository root:

```cmd
psql -h localhost -p 5432 -U postgres -d postgres -f db\setup-local.sql
```

That script creates the `main` and `app_user` roles if they do not already exist, creates the `nexttrade` database if it does not already exist, loads `db/finalized-schema.sql`, seeds the local instrument data, and applies the runtime grants needed by the app.

## Service guides

- `db/LOCAL_DEV.md`
- `auth/LOCAL_DEV.md`
- `nextTrade-orders/LOCAL_DEV.md`
- `nextTrade-holdings/LOCAL_DEV.md`
- `insights/LOCAL_DEV.md`
- `data-pipeline/LOCAL_DEV.md`
- `frontend/LOCAL_DEV.md`
- `insights-frontend/LOCAL_DEV.md`

## Optional Kafka broker

If you want the Orders service to publish terminal events and Insights to consume them without Docker, install Apache Kafka locally and start it from the Kafka distribution directory.
Use your downloaded Kafka install directory (for example `C:\kafka\kafka_3.7.1`), not this repository's `kafka/` folder.

```cmd
cd C:\kafka\kafka_3.7.1
bin\windows\zookeeper-server-start.bat config\zookeeper.properties
```

In a second terminal:

```cmd
cd C:\kafka\kafka_3.7.1
bin\windows\kafka-server-start.bat config\server.properties
```

Then create the shared topic:

```cmd
cd C:\kafka\kafka_3.7.1
bin\windows\kafka-topics.bat --create --bootstrap-server localhost:9092 --topic order-events --partitions 1 --replication-factor 1
```

The Spring Boot local profiles for `nextTrade-orders` and `insights` default Kafka bootstrap servers to `localhost:9092`. If you want to use the Docker-based broker instead, run the override described in `kafka/README.md`.

When using the native Kafka broker, keep 3 terminals open for ZooKeeper, the Kafka broker, and topic creation before you start the services.

## Local ports

| Service | Port | Notes |
| --- | --- | --- |
| PostgreSQL | `5432` | Local database server |
| `auth` | `8081` | NestJS auth and rules endpoints |
| `nextTrade-orders` | `8082` | Spring Boot orders API |
| `nextTrade-holdings` | `8080` | Spring Boot holdings API |
| `insights` | `8084` | Spring Boot insights API |
| `data-pipeline` | `8083` | Python quote API and ingestor process |
| `frontend` | `4300` | Trading Angular app |
| `insights-frontend` | `4301` | Reporting Angular app |

## Notes

- `auth` and `data-pipeline` use per-service `.env` files.
- `nextTrade-orders`, `nextTrade-holdings`, and `insights` use Spring Boot `application-local.yml` profiles.
- Frontends do not need `.env` files for the current local setup.
- No global shell scripts are required.
- Start and stop services one by one as needed.


