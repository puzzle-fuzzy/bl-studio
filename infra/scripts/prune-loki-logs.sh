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

# 校验删除请求已入队（Loki 返回 JSON 数组，[] 表示已无可应用请求）。
# P2-37：原来 `grep -q '{'` 会把空数组 []（已应用）和任何含 { 的响应都判成「已入队」；
# 改为真正解析 JSON。优先 python3（服务器 certbot 依赖 python3，必然存在），
# 缺失时退回「去空白后是否非空数组」的保守判断。
response="$(curl -fsS "${LOKI_URL}/loki/api/v1/delete")"
if command -v python3 >/dev/null 2>&1; then
  if printf '%s' "$response" | python3 -c 'import json,sys; sys.exit(0 if len(json.load(sys.stdin)) > 0 else 1)' 2>/dev/null; then
    echo "==> 删除请求已入队，compactor 将于下次压缩时应用（约 10 分钟内）"
  else
    echo "==> 未看到待处理删除请求（可能已应用）"
  fi
else
  compact="$(printf '%s' "$response" | tr -d '[:space:]')"
  if [[ -n "$compact" && "$compact" != "[]" && "$compact" != "null" ]]; then
    echo "==> 删除请求已入队，compactor 将于下次压缩时应用（约 10 分钟内）"
  else
    echo "==> 未看到待处理删除请求（可能已应用）"
  fi
fi
