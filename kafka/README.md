# Kafka Infrastructure

This directory contains the Kafka broker setup for the lil-leap project.

## Components

- **Dockerfile**: Custom Kafka broker image built on Confluent's Kafka image
- **broker-config/server.properties**: Broker configuration
- **topics/create-topics.sh**: Script to auto-create topics on startup

## Topics

The following topics are automatically created when the Kafka infrastructure starts:

- `orders-events`: Order-related events (producers: orders service)
- `holdings-events`: Holdings-related events (producers: holdings service)
- `insights-events`: Insights-related events (producers: insights service)

## Running Kafka

Kafka runs as part of the main Docker Compose stack:

```bash
docker compose up kafka zookeeper kafka-topics
```

Or start the entire stack (including all services):

```bash
docker compose up
```

## Kafka Broker Details

- **Internal Network**: `kafka:9092`
- **Host Access**: `localhost:29092`
- **Zookeeper**: `zookeeper:2181` (internal only)

Services within Docker can connect to Kafka using the hostname `kafka` on port `9092`.

## Monitoring

To check Kafka topics:

```bash
docker compose exec kafka kafka-topics.sh --list --bootstrap-server localhost:9092
```

To consume from a topic:

```bash
docker compose exec kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic orders-events \
  --from-beginning
```

## Notes

- `AUTO_CREATE_TOPICS_ENABLE` is set to `false` — topics must be created via the initialization script
- Replication factor is 1 (suitable for development, not production)
- Topics are created with 1 partition (can be adjusted in `create-topics.sh`)

