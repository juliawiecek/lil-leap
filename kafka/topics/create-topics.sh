#!/bin/bash
set -euo pipefail

# Wait for Kafka to be ready.
echo "Waiting for Kafka broker to start..."
cub kafka-ready -b kafka:9092 1 30 > /dev/null 2>&1

echo "Kafka broker is ready. Creating topics..."

# Create topics
kafka-topics --create \
  --bootstrap-server kafka:9092 \
  --topic orders-events \
  --partitions 1 \
  --replication-factor 1 \
  --if-not-exists

kafka-topics --create \
  --bootstrap-server kafka:9092 \
  --topic holdings-events \
  --partitions 1 \
  --replication-factor 1 \
  --if-not-exists

kafka-topics --create \
  --bootstrap-server kafka:9092 \
  --topic insights-events \
  --partitions 1 \
  --replication-factor 1 \
  --if-not-exists

echo "Topics created successfully!"
kafka-topics --list --bootstrap-server kafka:9092

