#!/bin/bash
set -euo pipefail
# Confluent images expose Kafka commands without the .sh suffix.
ready=false
for attempt in $(seq 1 60); do
    if kafka-broker-api-versions --bootstrap-server kafka:9092 >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 2
done
if [ "$ready" != true ]; then
    echo 'Kafka did not become ready within 120 seconds' >&2
    exit 1
fi
for topic in orders-events holdings-events insights-events; do
    kafka-topics --create --bootstrap-server kafka:9092 --topic "$topic" \
        --partitions 1 --replication-factor 1 --if-not-exists
done
kafka-topics --list --bootstrap-server kafka:9092
