# Optional Kafka development infrastructure

The broker is opt-in and is not on the trading or reporting request path. Current
services do not publish or consume Kafka events; settlement remains a database
transaction and Insights follows PostgreSQL replication.

From the repository root:

```sh
docker compose -f docker-compose.yml -f docker-compose.kafka.yml up --build -d kafka kafka-topics
docker compose -f docker-compose.yml -f docker-compose.kafka.yml logs kafka-topics
docker compose -f docker-compose.yml -f docker-compose.kafka.yml exec kafka kafka-topics --list --bootstrap-server kafka:9092
```

The override adds ZooKeeper, the broker and an idempotent topic initialization job.
It creates `orders-events`, `holdings-events` and `insights-events`, each with one
partition and replication factor one. These names reserve future contracts;
they do not imply working application integrations.

Containers connect to `kafka:9092`. Host tools use `localhost:29092`, bound only
to loopback. The existing Confluent 7.5.0 base image is retained. Runtime settings
come from the Dockerfile environment; `broker-config/server.properties` is an
unused reference file, not an active override. See the
[Confluent configuration reference](https://docs.confluent.io/platform/7.5/installation/docker/config-reference.html).

Topic initialization has a bounded readiness wait and fails on command errors.
The Compose model and Bash syntax can be checked without running a broker; live
broker startup still requires Docker. This configuration is for development.
