#!/bin/bash
CONTAINERS=("vjstv_ch1" "vjstv_ch2" "vjstv_ch3")

for container in "${CONTAINERS[@]}"; do
  STATUS=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
  if [ "$STATUS" != "running" ]; then
    echo "[HEALTH] $container is $STATUS — restarting..."
    docker restart "$container"
  else
    echo "[HEALTH] $container is running"
  fi
done
