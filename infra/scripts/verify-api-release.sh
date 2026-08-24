#!/usr/bin/env bash
# Verify that the public API entrypoint reports the immutable release SHA.
set -euo pipefail

EXPECTED_RELEASE="${1:?expected release is required}"
SITE_DOMAIN="${2:?site domain is required}"
SERVER_HOST="${3:?server host is required}"

response="$(curl -fsSL --max-time 20 --resolve "$SITE_DOMAIN:443:$SERVER_HOST" "https://$SITE_DOMAIN/api/health/live")"
if ! printf '%s' "$response" | grep -Fq "\"release\":\"$EXPECTED_RELEASE\""; then
  echo "api release verification failed: expected $EXPECTED_RELEASE, response did not report that release" >&2
  exit 1
fi

echo "api release verified: $EXPECTED_RELEASE"
