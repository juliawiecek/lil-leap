#!/bin/bash
set -euo pipefail

# Wait for Kafka to be ready.
echo "Waiting for Kafka broker to start..."
until kafka-topics.sh --bootstrap-server kafka:9092 --list > /dev/null 2>&1; do
  sleep 1
done

echo "Kafka broker is ready. Creating topics..."

# Create topics
kafka-topics.sh --create \
  --bootstrap-server kafka:9092 \
  --topic orders-events \
  --partitions 1 \
  --replication-factor 1 \
  --if-not-exists

kafka-topics.sh --create \
  --bootstrap-server kafka:9092 \
  --topic holdings-events \
  --partitions 1 \
  --replication-factor 1 \
  --if-not-exists

kafka-topics.sh --create \
  --bootstrap-server kafka:9092 \
  --topic insights-events \
  --partitions 1 \
  --replication-factor 1 \
  --if-not-exists

echo "Topics created successfully!"
kafka-topics.sh --list --bootstrap-server kafka:9092

