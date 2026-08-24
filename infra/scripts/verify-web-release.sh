#!/usr/bin/env bash
# Verify that the public web entrypoint serves the exact index bundle produced by
# the image being deployed. Health checks alone do not prove that the web
# container switched to the requested release.
set -euo pipefail

EXPECTED_INDEX_ASSET="${1:?expected index asset is required}"
SITE_DOMAIN="${2:?site domain is required}"
SERVER_HOST="${3:?server host is required}"

actual_index_asset="$({
  curl -fsSL --max-time 20 --resolve "$SITE_DOMAIN:443:$SERVER_HOST" "https://$SITE_DOMAIN/"
} | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -n 1 || true)"

if [[ -z "$actual_index_asset" ]]; then
  echo "web release verification failed: public index does not expose an index bundle" >&2
  exit 1
fi

if [[ "$actual_index_asset" != "$EXPECTED_INDEX_ASSET" ]]; then
  echo "web release verification failed: expected $EXPECTED_INDEX_ASSET, got $actual_index_asset" >&2
  exit 1
fi

echo "web release verified: $actual_index_asset"
