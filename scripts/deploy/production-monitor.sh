#!/bin/sh
# Bailian Studio 生产 watchdog。只读取 Docker 状态、ready、备份新鲜度和宿主机磁盘；
# 不修改容器、数据库或备份。告警 webhook 可选，未配置时故障仍会写入日志。
set -eu

MONITOR_PROJECT="${MONITOR_PROJECT:-bailian-studio-prod}"
MONITOR_WEB_URL="${MONITOR_WEB_URL:-http://web:5002}"
MONITOR_INTERVAL_SECONDS="${MONITOR_INTERVAL_SECONDS:-60}"
MONITOR_BACKUP_MAX_AGE_HOURS="${MONITOR_BACKUP_MAX_AGE_HOURS:-30}"
MONITOR_DISK_USED_PERCENT="${MONITOR_DISK_USED_PERCENT:-85}"
MONITOR_ALERT_WEBHOOK_URL="${MONITOR_ALERT_WEBHOOK_URL:-}"
MONITOR_STATE_FILE="${MONITOR_STATE_FILE:-/var/lib/bailian-monitor/last-state}"

issues=""

add_issue() {
  if [ -z "$issues" ]; then issues="$1"; else issues="$issues,$1"; fi
}

container_id() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=$MONITOR_PROJECT" \
    --filter "label=com.docker.compose.service=$1" | head -n 1
}

check_container() {
  service="$1"
  id="$(container_id "$service")"
  if [ -z "$id" ]; then add_issue "${service}_missing"; return; fi
  state="$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null || printf '%s' unknown)"
  if [ "$state" != running ]; then add_issue "${service}_${state}"; return; fi
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || printf '%s' unknown)"
  if [ "$health" = unhealthy ]; then add_issue "${service}_unhealthy"; fi
}

check_api_ready() {
  response="$(wget -q -O - -T 5 "$MONITOR_WEB_URL/api/health/ready" 2>/dev/null || true)"
  if [ -z "$response" ]; then
    add_issue api_ready_unreachable
  elif ! printf '%s' "$response" | grep -q '"success":true'; then
    add_issue api_not_ready
  fi
}

check_backup_freshness() {
  backup_id="$(container_id backup)"
  if [ -z "$backup_id" ]; then add_issue backup_missing; return; fi
  latest="$(docker exec "$backup_id" sh -c 'for f in /backups/bailian-studio-*.sql.gz; do [ -f "$f" ] || continue; stat -c %Y "$f"; done' 2>/dev/null | sort -nr | head -n 1 || true)"
  if [ -z "$latest" ]; then add_issue backup_file_missing; return; fi
  age=$(($(date +%s) - latest))
  if [ "$age" -gt $((MONITOR_BACKUP_MAX_AGE_HOURS * 3600)) ]; then add_issue backup_stale; fi
}

check_disk() {
  used="$(df -P /host 2>/dev/null | awk 'NR==2 {gsub("%", "", $5); print $5}' || true)"
  case "$used" in
    ''|*[!0-9]*) add_issue disk_unknown ;;
    *) if [ "$used" -ge "$MONITOR_DISK_USED_PERCENT" ]; then add_issue "disk_${used}pct"; fi ;;
  esac
}

send_alert() {
  state="$1"
  fingerprint="$2"
  [ -n "$MONITOR_ALERT_WEBHOOK_URL" ] || return 0
  payload="$(printf '{"text":"Bailian Studio production monitor: %s (%s)"}' "$state" "$fingerprint")"
  if ! wget -q -O - --header='Content-Type: application/json' --post-data="$payload" -T 10 "$MONITOR_ALERT_WEBHOOK_URL" >/dev/null 2>&1; then
    printf '%s\n' '{"level":"warn","scope":"production-monitor","msg":"monitor.alert_delivery_failed"}'
  fi
}

run_once() {
  issues=""
  check_container postgres
  check_container api
  check_container worker
  check_container backup
  check_api_ready
  check_backup_freshness
  check_disk
  fingerprint="${issues:-ok}"
  previous=""
  if [ -f "$MONITOR_STATE_FILE" ]; then previous="$(cat "$MONITOR_STATE_FILE")"; fi
  if [ "$previous" != "$fingerprint" ]; then
    if [ "$fingerprint" = ok ] && [ -n "$previous" ] && [ "$previous" != ok ]; then
      send_alert recovered "$previous"
    elif [ "$fingerprint" != ok ]; then
      send_alert degraded "$fingerprint"
    fi
    mkdir -p "$(dirname "$MONITOR_STATE_FILE")"
    printf '%s' "$fingerprint" > "$MONITOR_STATE_FILE"
  fi
  if [ "$fingerprint" = ok ]; then
    printf '%s\n' '{"level":"info","scope":"production-monitor","msg":"monitor.check","issues":""}'
    return 0
  fi
  printf '{"level":"error","scope":"production-monitor","msg":"monitor.check","issues":"%s"}\n' "$fingerprint"
  return 1
}

case "${1:-loop}" in
  once) run_once ;;
  loop)
    while true; do run_once || true; sleep "$MONITOR_INTERVAL_SECONDS"; done
    ;;
  *) echo "用法：production-monitor.sh [once|loop]" >&2; exit 2 ;;
esac
