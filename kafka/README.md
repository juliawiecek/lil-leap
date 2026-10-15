# Optional Kafka development infrastructure

The broker is opt-in and is not on the trading or reporting request path.
Orders publishes terminal order lifecycle events to one shared topic and
Insights consumes that topic in three separate consumer groups to write CSV
outputs locally. Settlement still remains a database transaction.

## Local broker without Docker

If you want to run Kafka locally on Windows without Docker, download Apache Kafka
3.7.x and extract it somewhere on disk, for example `C:\kafka\kafka_3.7.1`.

**Terminal 1 — ZooKeeper**

```cmd
cd C:\kafka\kafka_3.7.1
bin\windows\zookeeper-server-start.bat config\zookeeper.properties
```

**Terminal 2 — Kafka broker**

```cmd
cd C:\kafka\kafka_3.7.1
bin\windows\kafka-server-start.bat config\server.properties
```

**Terminal 3 — create the topic**

```cmd
cd C:\kafka\kafka_3.7.1
bin\windows\kafka-topics.bat --create --bootstrap-server localhost:9092 --topic order-events --partitions 1 --replication-factor 1
bin\windows\kafka-topics.bat --list --bootstrap-server localhost:9092
```

Orders and Insights local profiles default their Kafka bootstrap servers to
`localhost:9092`, so they can connect to the native broker automatically.

## Docker-based broker (optional alternative)

If you prefer Docker, run the existing override from the repository root:

```cmd
docker compose -f docker-compose.yml -f docker-compose.kafka.yml up --build -d kafka kafka-topics
docker compose -f docker-compose.yml -f docker-compose.kafka.yml logs kafka-topics
docker compose -f docker-compose.yml -f docker-compose.kafka.yml exec kafka kafka-topics --list --bootstrap-server kafka:9092
```

The override adds ZooKeeper, the broker and an idempotent topic initialization job.
It creates the shared `order-events` topic with one partition and replication
factor one. Orders publishes to that topic once an order reaches a terminal
state, and Insights receives the same stream through three consumer groups.

Containers connect to `kafka:9092`. Host tools use `localhost:29092`, bound only
to loopback. The existing Confluent 7.5.0 base image is retained. Runtime settings
come from the Dockerfile environment; `broker-config/server.properties` is an
unused reference file, not an active override. See the
[Confluent configuration reference](https://docs.confluent.io/platform/7.5/installation/docker/config-reference.html).

The Insights consumers write their CSV outputs to the configured
`INSIGHTS_KAFKA_OUTPUT_DIR` (defaulting to the JVM temp directory).

Topic initialization has a bounded readiness wait and fails on command errors.
The Compose model and Bash syntax can be checked without running a broker; live
broker startup still requires Docker. This configuration is for development.
