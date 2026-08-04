#!/usr/bin/env bash
# 清理 Loki 旧日志（2C2G 服务器内存/磁盘吃紧时的安全阀）。
#
# 通过 Loki delete API 队列化删除早于 CUTOFF_HOURS 的日志；删除由 compactor
# 在下一次压缩周期真正应用（loki.yaml 已开启 deletion_mode: filter-and-delete）。
# 用法（在服务器上执行）：pnpm run logs:prune  或  CUTOFF_HOURS=48 pnpm run logs:prune
set -euo pipefail

LOKI_URL="${LOKI_URL:-http://127.0.0.1:3100}"
# 删除多少小时前的日志；默认 24h。
CUTOFF_HOURS="${CUTOFF_HOURS:-24}"
# 作用域：默认删整个生产栈；可用 LOKI_QUERY 覆盖（如按 container 过滤）。
LOKI_QUERY="${LOKI_QUERY:-\{compose_project=\"bailian-studio-prod\"\}}"

END_MS="$(( ( $(date +%s) - CUTOFF_HOURS * 3600 ) * 1000 ))"

echo "==> 队列化删除 ${CUTOFF_HOURS}h 前的日志（query=${LOKI_QUERY}）"
curl -fsS -X POST \
  -H 'Content-Type: application/json' \
  --data-urlencode "query=${LOKI_QUERY}" \
  --data-urlencode "start=0" \
  --data-urlencode "end=${END_MS}" \
  "${LOKI_URL}/loki/api/v1/delete"

# 校验删除请求已入队（返回列表里应含一条）。
curl -fsS "${LOKI_URL}/loki/api/v1/delete" | grep -q '{' \
  && echo "==> 删除请求已入队，compactor 将于下次压缩时应用（约 10 分钟内）" \
  || { echo "==> 未看到待处理删除请求（可能已应用）"; exit 0; }
