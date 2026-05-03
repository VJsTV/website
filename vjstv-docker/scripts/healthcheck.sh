#!/bin/sh
# Checks that each channel's heartbeat file is fresh (written within the last 5 min).
# Called by Docker HEALTHCHECK on the scheduler container — no docker.sock needed.
STALE_THRESHOLD=300
STATE_DIR="/app/state"
CHANNELS="ch1-live ch2-loop-gallery ch3-vj-education"
NOW=$(date +%s)

for ch in $CHANNELS; do
  FILE="${STATE_DIR}/heartbeat-${ch}.json"
  if [ ! -f "$FILE" ]; then
    echo "[HEALTH] Missing heartbeat for $ch"
    exit 1
  fi
  LAST_TICK=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('$FILE')).last_tick))" 2>/dev/null)
  if [ -z "$LAST_TICK" ]; then
    echo "[HEALTH] Cannot read last_tick for $ch"
    exit 1
  fi
  AGE=$((NOW - LAST_TICK))
  if [ "$AGE" -gt "$STALE_THRESHOLD" ]; then
    echo "[HEALTH] $ch heartbeat stale (${AGE}s > ${STALE_THRESHOLD}s)"
    exit 1
  fi
  echo "[HEALTH] $ch OK (${AGE}s)"
done
